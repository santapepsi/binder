// Search the catalog and add a copy to a binder.

import type { Catalog, CatalogHit } from "../data/catalog.ts";
import { PAGE_SIZE } from "../data/catalog.ts";
import { prefetchCard } from "../data/images.ts";
import type { NewCopy, Store } from "../data/store.ts";
import { frameOf, typeLine } from "../model/classify.ts";
import type { Binder, BinderCard, CardSnapshot } from "../model/types.ts";
import { copyFields } from "./copyFields.ts";
import { dialogShell, h, icon, openDialog } from "./dom.ts";

export function openAddCard(options: {
  store: Store;
  catalog: Catalog;
  binder: Binder;
  slot?: number;
  onAdded: (card: BinderCard) => void;
}) {
  const { store, catalog, binder } = options;
  const body = h("div", { class: "add-body" });
  const dialog = dialogShell(options.slot !== undefined ? "Add card to this pocket" : "Add card", body);
  const offline = !navigator.onLine;

  // ---- step 1: search
  const input = h("input", {
    type: "search",
    placeholder: "Search by card name…",
    autocomplete: "off",
    enterkeyhint: "search",
    "aria-label": "Search cards",
  });
  const results = h("ul", { class: "results", role: "listbox" });
  const status = h("p", { class: "muted" });
  const more = h("button", { class: "button ghost", text: "Load more" });
  more.hidden = true;
  let page = 1;
  let query = "";
  let timer = 0;
  let latest = 0;

  const run = async (append = false) => {
    const ticket = ++latest;
    if (!append) page = 1;
    try {
      if (!catalog.ready) {
        // First use: download the whole card database once (texts, sets, artworks).
        await catalog.ensure(({ phase, bytes }) => {
          status.textContent =
            phase === "checking"
              ? "Checking the card database…"
              : phase === "saving"
                ? "Saving the card database on this device…"
                : `Downloading the card database (first time only)… ${((bytes ?? 0) / 1048576).toFixed(1)} MB`;
        });
      }
      const { items, total } = await catalog.search(query, page);
      if (ticket !== latest) return;
      if (!append) results.replaceChildren();
      items.forEach((hit) => results.append(resultRow(hit)));
      status.textContent = total ? `${total} card${total === 1 ? "" : "s"}` : "No cards found.";
      more.hidden = page * PAGE_SIZE >= total;
    } catch (error) {
      status.textContent = offline
        ? "You are offline. The card database is downloaded the first time you add a card; connect once to get it."
        : `Could not get the card database: ${(error as Error).message}`;
    }
  };

  const resultRow = (hit: CatalogHit) =>
    h(
      "li",
      {},
      h(
        "button",
        { class: "result", onclick: () => chooseCard(hit) },
        h("span", { class: `swatch frame-${frameOf(hit)}` }),
        h("span", { class: "result-name", text: hit.name }),
        h("span", { class: "result-type", text: typeLine(hit) })
      )
    );

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      query = input.value;
      run();
    }, 250);
  });
  more.addEventListener("click", () => {
    page++;
    run(true);
  });

  const searchStep = h("div", { class: "search-step" }, h("div", { class: "search-box" }, icon("search"), input), status, results, more);

  // ---- step 2: details of the copy
  const chooseCard = async (hit: CatalogHit) => {
    body.replaceChildren(h("p", { class: "muted", text: "Loading card…" }));
    let card: CardSnapshot;
    try {
      card = await catalog.card(hit.id);
    } catch (error) {
      body.replaceChildren(searchStep);
      status.textContent = `Could not load the card: ${(error as Error).message}`;
      return;
    }
    const copy: NewCopy = { printing: null, artworkId: null, condition: "Near Mint", language: "English", edition: "Unlimited", notes: "" };
    const target =
      binder.kind === "personal"
        ? binder
        : store.binderForCard(card) ?? store.liveBinders().find((entry) => entry.kind === "personal") ?? binder;
    const add = h("button", { class: "button primary" }, icon("plus", `Add to ${target.name}`));
    add.addEventListener("click", async () => {
      add.disabled = true;
      const slot = target.id === binder.id ? options.slot : undefined;
      const entry = await store.addCard(binder.id, card, copy, slot);
      prefetchCard(card, copy.artworkId).catch(() => undefined);
      dialog.close();
      options.onAdded(entry);
    });
    body.replaceChildren(
      h("button", { class: "link-button back", onclick: () => body.replaceChildren(searchStep) }, icon("back", "Back to results")),
      h(
        "div",
        { class: "add-card" },
        h("h3", { class: "card-name", text: card.name }),
        h("div", { class: `type-tag frame-${frameOf(card)}`, text: `[${typeLine(card)}]` }),
        target.id !== binder.id ? h("p", { class: "muted", text: `Goes to the ${target.name} binder.` }) : null
      ),
      copyFields(catalog, card, copy, (patch) => Object.assign(copy, patch)),
      h("div", { class: "dialog-actions" }, add)
    );
  };

  body.append(searchStep);
  openDialog(dialog);
  input.focus();
  run();
}
