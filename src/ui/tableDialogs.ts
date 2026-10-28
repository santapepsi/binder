// Dialogs for the card spots on the table: what a spot holds, and picking a card.

import { PAGE_SIZE, type Catalog, type CatalogHit } from "../data/catalog.ts";
import { prefetchCard } from "../data/images.ts";
import type { TableStore } from "../data/table.ts";
import { artworksOf } from "../model/artworks.ts";
import { frameOf, typeLine } from "../model/classify.ts";
import type { CardSnapshot } from "../model/types.ts";
import { dialogShell, field, h, icon, openDialog, select } from "./dom.ts";
import { t, translateTypeLine } from "../i18n.ts";

export function openSpotMenu(
  table: TableStore,
  catalog: Catalog,
  id: string,
  highlight: (id: string, on: boolean) => void = () => undefined
) {
  const slot = table.get(id);
  if (!slot) return;
  const body = h("div", { class: "spot-menu" });
  const dialog = dialogShell(t("Card on the table"), body);
  highlight(id, true);
  dialog.addEventListener("close", () => highlight(id, false));
  const turn = (degrees: number) => table.update(id, { rotation: slot.rotation + (degrees * Math.PI) / 180 });

  const render = () => {
    const current = table.get(id);
    if (!current) return dialog.close();
    body.replaceChildren(
      h("p", { class: "spot-card" }, current.card ? h("strong", { text: current.card.name }) : h("span", { class: "muted", text: t("Empty spot") })),
      h(
        "div",
        { class: "button-grid" },
        h(
          "button",
          {
            class: "button primary",
            onclick: () =>
              openCardPicker(catalog, (card, artworkId, faceDown) => {
                table.update(id, { card, artworkId, faceDown }).then(render);
                if (!faceDown) prefetchCard(card, artworkId).catch(() => undefined);
              }),
          },
          current.card ? t("Change card") : t("Choose card")
        ),
        h(
          "button",
          {
            class: "button ghost",
            onclick: () => table.update(id, { faceDown: !current.faceDown }).then(render),
          },
          current.faceDown ? t("Turn face up") : t("Turn face down")
        ),
        h("button", { class: "button ghost", onclick: () => turn(-15) }, t("↺ Rotate 15°")),
        h("button", { class: "button ghost", onclick: () => turn(15) }, t("↻ Rotate 15°")),
        h("button", { class: "button ghost", onclick: () => turn(90) }, t("Turn 90°")),
        h("button", { class: "button ghost", onclick: () => table.update(id, { rotation: 0 }) }, t("Straighten")),
        current.card
          ? h("button", { class: "button ghost", onclick: () => table.update(id, { card: null, artworkId: null }).then(render) }, t("Take card out"))
          : null,
        h(
          "button",
          {
            class: "button ghost",
            onclick: async () => {
              const added = await table.add();
              dialog.close();
              openSpotMenu(table, catalog, added.id, highlight);
            },
          },
          icon("plus", t("Add another spot"))
        ),
        h(
          "button",
          {
            class: "button danger",
            onclick: () => {
              table.remove(id);
              dialog.close();
            },
          },
          icon("trash", t("Remove spot"))
        )
      ),
      h("p", { class: "muted small", text: t("Drag a spot to move it (long-press on touch screens).") })
    );
  };
  render();
  openDialog(dialog);
}

/** Search the card database and return a card, its artwork and whether it lies face down. */
export function openCardPicker(catalog: Catalog, onPick: (card: CardSnapshot, artworkId: string | null, faceDown: boolean) => void) {
  const body = h("div", { class: "add-body" });
  const dialog = dialogShell(t("Choose a card"), body);
  const input = h("input", { type: "search", placeholder: t("Search by card name…"), autocomplete: "off", "aria-label": t("Search cards") });
  const results = h("ul", { class: "results" });
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
          : t(total === 1 ? "{n} card" : "{n} cards", { n: total })
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
        { class: "result", onclick: () => choose(hit) },
        h("span", { class: `swatch frame-${frameOf(hit)}` }),
        h("span", { class: "result-name", text: hit.name }),
        h("span", { class: "result-type", text: translateTypeLine(typeLine(hit)) })
      )
    );

  const searchStep = h("div", { class: "search-step" }, h("div", { class: "search-box" }, icon("search"), input), status, results);

  const choose = async (hit: CatalogHit) => {
    const card = await catalog.card(hit.id);
    const artworks = artworksOf(card);
    let artworkId: string | null = null;
    const faceDown = h("input", { type: "checkbox" });
    const labels = artworks.map((_, index) => (index === 0 ? t("Artwork 1 (main)") : t("Artwork {n}", { n: index + 1 })));
    body.replaceChildren(
      h("button", { class: "link-button back", onclick: () => body.replaceChildren(searchStep) }, icon("back", t("Back to results"))),
      h("h3", { class: "card-name", text: card.name }),
      h("div", { class: `type-tag frame-${frameOf(card)}`, text: `[${translateTypeLine(typeLine(card))}]` }),
      ...(artworks.length > 1
        ? [field(t("Artwork"), select(labels, labels[0], (label) => (artworkId = artworks[labels.indexOf(label)].id)))]
        : []),
      h("label", { class: "check" }, faceDown, h("span", { text: t("Place it face down") })),
      h(
        "div",
        { class: "dialog-actions" },
        h(
          "button",
          {
            class: "button primary",
            onclick: () => {
              dialog.close();
              onPick(card, artworkId, faceDown.checked);
            },
          },
          t("Put on the table")
        )
      )
    );
  };

  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 250);
  });
  body.append(searchStep);
  openDialog(dialog);
  input.focus();
  run();
}
