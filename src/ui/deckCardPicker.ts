// Search the whole card database and add cards to a deck (owned or not), one
// click per copy. The dialog stays open so several cards can be added in a row.

import { PAGE_SIZE, type Catalog, type CatalogHit } from "../data/catalog.ts";
import { frameOf, typeLine } from "../model/classify.ts";
import { plural, t, translateTypeLine } from "../i18n.ts";
import { dialogShell, h, icon, openDialog, toast } from "./dom.ts";
import type { CardSnapshot } from "../model/types.ts";

export function openDeckCardPicker(
  catalog: Catalog,
  target: "deck" | "side",
  add: (card: CardSnapshot) => Promise<string | null>
) {
  const input = h("input", { type: "search", placeholder: t("Search by card name…"), autocomplete: "off", "aria-label": t("Search cards") });
  const results = h("ul", { class: "results", role: "listbox" });
  const status = h("p", { class: "muted" });
  let timer = 0;
  let latest = 0;

  const run = async () => {
    const ticket = ++latest;
    try {
      if (!catalog.ready)
        await catalog.ensure(({ phase, bytes }) => {
          status.textContent =
            phase === "downloading"
              ? t("Downloading the card database (first time only)… {mb} MB", { mb: ((bytes ?? 0) / 1048576).toFixed(1) })
              : t("Preparing the card database…");
        });
      const { items, total } = await catalog.search(input.value, 1);
      if (ticket !== latest) return;
      results.replaceChildren(...items.map(row));
      status.textContent = total
        ? total > PAGE_SIZE
          ? t("{n} cards — keep typing to narrow down", { n: total })
          : plural(total, "{n} card", "{n} cards")
        : t("No cards found.");
    } catch (error) {
      status.textContent = t("Could not get the card database: {error}", { error: (error as Error).message });
    }
  };

  const row = (hit: CatalogHit) =>
    h(
      "li",
      {},
      h(
        "button",
        {
          class: "result",
          onclick: async () => {
            try {
              const card = await catalog.card(hit.id);
              const problem = await add(card);
              toast(problem ?? t("{name} added.", { name: card.name }));
            } catch (error) {
              toast(t("Could not load the card: {error}", { error: (error as Error).message }));
            }
          },
        },
        h("span", { class: `swatch frame-${frameOf(hit)}` }),
        h("span", { class: "result-name", text: hit.name }),
        h("span", { class: "result-type", text: translateTypeLine(typeLine(hit)) })
      )
    );

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 250);
  });
  const dialog = dialogShell(
    target === "side" ? t("Add card to the Side Deck") : t("Add card to the deck"),
    h(
      "div",
      { class: "add-body" },
      h("div", { class: "search-step" }, h("div", { class: "search-box" }, icon("search"), input), h("p", { class: "muted", text: t("Click a card to add a copy. Cards you do not own can be added too.") }), status, results)
    )
  );
  openDialog(dialog);
  input.focus();
  run();
}
