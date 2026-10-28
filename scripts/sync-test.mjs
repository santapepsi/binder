// Two "devices" sign in to the mock Supabase; device A hides the cover name;
// checks it stays hidden after a reload on A and shows up hidden on device B.
import { chromium } from "playwright";
const app = process.argv[2] ?? "http://localhost:8765/";
const mock = process.argv[3] ?? "http://localhost:54321";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function device(label) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript((url) => localStorage.setItem("binder.settings", JSON.stringify({ supabaseUrl: url, supabaseKey: "k" })), mock);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(label, "pageerror", error.message));
  await page.goto(app + "?debug&catalog=cardinfo.json");
  await page.waitForFunction(() => window.binderApp);
  return page;
}
const state = (page) =>
  page.evaluate(() => {
    const binder = window.binderApp.store.liveBinders().find((entry) => entry.kind === "monster-normal");
    return { showName: binder.showName, color: binder.coverColor, count: window.binderApp.store.liveBinders().length };
  });
const signIn = (page) => page.evaluate(() => window.binderApp.sync.signIn("test@example.com", "x"));
const sync = (page) => page.evaluate(() => window.binderApp.sync.syncNow());

const a = await device("A");
await signIn(a);
await a.evaluate(async () => {
  const { store } = window.binderApp;
  const binder = store.liveBinders().find((entry) => entry.kind === "monster-normal");
  await store.updateBinder(binder.id, { showName: false, coverColor: "#123456" });
});
// cover font through Settings
await a.click('[aria-label="Settings"]');
await a.setInputFiles('.settings-section input[type="file"] >> nth=0', process.env.FONT_FILE);
await a.waitForTimeout(500);
await a.keyboard.press("Escape");
await sync(a);
console.log("A after change", await state(a), "warning:", await a.evaluate(() => window.binderApp.sync.schemaWarning));
await a.reload();
await a.waitForFunction(() => window.binderApp);
await sync(a);
console.log("A after reload", await state(a));

const b = await device("B");
await signIn(b);
console.log("B after sign-in", await state(b), "font:", await b.evaluate(() => [...document.fonts].some((face) => face.family === "CoverLettering")));
await b.reload();
await b.waitForFunction(() => window.binderApp);
await sync(b);
console.log("B after reload", await state(b));
await browser.close();
