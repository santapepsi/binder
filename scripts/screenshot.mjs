// Smoke test in a real browser: loads the built app, adds demo cards, turns
// pages and saves screenshots. Usage: node scripts/screenshot.mjs <url> <outdir>
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:8765/";
const out = process.argv[3] ?? "screenshots";
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];

async function run(name, viewport, steps) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
  // Image downloads can fail (offline, CORS, blocked hosts): the app falls back on its own.
  const expected = /Failed to load resource|CORS|ERR_|net::/;
  page.on("console", (message) => message.type() === "error" && !expected.test(message.text()) && errors.push(`${name}: ${message.text()}`));
  // The test database (tests/fixtures/cardinfo.json) must be served next to the app.
  await page.goto(url + (url.includes("?") ? "&" : "?") + "debug&catalog=cardinfo.json");
  await page.waitForSelector(".scene-canvas");
  await page.waitForTimeout(800);
  await steps(page);
  await page.close();
}

const shot = (page, file) => page.screenshot({ path: `${out}/${file}.png` });

async function addCard(page, query) {
  await page.click(".button.add");
  await page.fill('input[type="search"]', query);
  await page.waitForTimeout(500);
  await page.click(".result >> nth=0");
  await page.waitForSelector(".dialog-actions .button.primary");
  await page.waitForTimeout(250);
  await page.click(".dialog-actions .button.primary");
  await page.waitForTimeout(900);
}

await run("desktop", { width: 1440, height: 900 }, async (page) => {
  await shot(page, "01-closed-cover");
  // custom cover: hex colour
  await page.click('[aria-label="Edit binder"]');
  await page.fill(".hex", "#2b4a7a");
  await page.uncheck(".check input");
  await page.click(".dialog-actions .button.primary");
  await page.waitForTimeout(500);
  await shot(page, "01b-cover-colour");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1100);
  await shot(page, "02-open-empty");
  // Spell binder: switch through the shelf
  await page.click(".title-button");
  await page.click(".shelf-pick >> text=Spells");
  await page.waitForTimeout(400);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1100);
  for (const name of ["Pot of Greed", "Monster Reborn", "Back to Square One", "Mystical Space Typhoon"]) await addCard(page, name);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await shot(page, "03-spells");
  const at = (slot) => page.evaluate((value) => window.binderApp.scene.pocketOnScreen(value), slot);
  // hover + select the first pocket of page 1 (right page)
  const pocket = await at(1);
  const target = await at(7);
  await page.mouse.move(pocket.x, pocket.y);
  await page.waitForTimeout(300);
  await page.mouse.click(pocket.x, pocket.y);
  await page.waitForTimeout(700);
  await shot(page, "04-selected");
  // drag the card to another pocket
  await page.mouse.move(pocket.x, pocket.y);
  await page.mouse.down();
  await page.mouse.move(pocket.x + 30, pocket.y + 40, { steps: 6 });
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.waitForTimeout(300);
  await shot(page, "05-dragging");
  await page.mouse.up();
  await page.waitForTimeout(600);
  await shot(page, "06-dropped");
  // page turn mid-animation
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(280);
  await shot(page, "07-turning");
  await page.waitForTimeout(900);
  await shot(page, "08-next-spread");
  // table spots: put a card face up in one and another face down
  const spots = await page.evaluate(() =>
    window.binderApp.table.slots.map((slot) => window.binderApp.scene.tableOnScreen(slot.x, slot.z))
  );
  const place = async (index, name, faceDown) => {
    await page.mouse.click(spots[index].x, spots[index].y);
    await page.click(".spot-menu .button.primary");
    await page.fill('input[type="search"]', name);
    await page.waitForTimeout(400);
    await page.click(".result >> nth=0");
    if (faceDown) await page.check(".check input");
    await page.click("text=Put on the table");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  };
  await place(4, "Monster Reborn", false);
  await place(0, "Mirror Force", true);
  // drag a spot a little
  await page.mouse.move(spots[5].x, spots[5].y);
  await page.mouse.down();
  await page.mouse.move(spots[5].x - 20, spots[5].y + 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await shot(page, "08c-table-spots");
});

await run("phone", { width: 412, height: 860 }, async (page) => {
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(1200);
  // Dark Magician has three artworks: pick the second one.
  await page.click(".button.add");
  await page.fill('input[type="search"]', "dark magician");
  await page.waitForTimeout(500);
  await page.click(".result >> nth=0");
  await page.waitForSelector(".dialog-actions .button.primary");
  await page.selectOption('select:has(option:text("Artwork 2"))', { label: "Artwork 2" });
  await shot(page, "08b-add-dialog");
  await page.click(".dialog-actions .button.primary");
  await page.waitForTimeout(1200);
  await shot(page, "09-phone");
  await page.click(".sheet-close");
  await page.waitForTimeout(700);
  await shot(page, "10-phone-page");
});

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("ok");
