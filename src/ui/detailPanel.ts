// Left panel (bottom sheet on phones): the selected card large, its text, and
// the details of your copy.

import type { Catalog } from "../data/catalog.ts";
import { cardImage } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import { frameOf, rarityTag, typeLine } from "../model/classify.ts";
import { pageOfSlot, pocketOfSlot } from "../model/layout.ts";
import type { Binder, BinderCard } from "../model/types.ts";
import { copyFields } from "./copyFields.ts";
import { field, h, icon } from "./dom.ts";

export class DetailPanel {
  readonly element = h("aside", { class: "detail panel", "aria-label": "Card details" });
  private current: BinderCard | null = null;

  constructor(
    private store: Store,
    private getCatalog: () => Catalog,
    private onClose: () => void
  ) {}

  show(card: BinderCard | null, binder: Binder) {
    this.current = card;
    document.body.classList.toggle("has-selection", !!card);
    if (!card) return this.empty(binder);
    const art = h("div", { class: "detail-art" });
    cardImage(card.card, "full").then((image) => {
      if (this.current?.id !== card.id) return;
      const canvas = h("canvas", { width: image.width, height: image.height, "aria-label": card.card.name });
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      art.replaceChildren(canvas);
    });
    const info = card.card;
    const stats = [
      info.level ? `Level ${info.level}` : null,
      info.rank ? `Rank ${info.rank}` : null,
      info.linkRating ? `Link ${info.linkRating}` : null,
      info.pendulumScale !== null ? `Scale ${info.pendulumScale}` : null,
      info.atk !== null ? `ATK ${info.atk}` : null,
      info.def !== null && !info.linkRating ? `DEF ${info.def}` : null,
    ].filter(Boolean);
    const others = this.store.liveBinders().filter((binder) => binder.id !== card.binderId);
    const move = h("select", { "aria-label": "Move to binder" });
    move.append(h("option", { value: "", text: "Move to…" }));
    others.forEach((binder) => move.append(h("option", { value: binder.id, text: binder.name })));
    move.addEventListener("change", () => move.value && this.store.moveToBinder(card.id, move.value));
    const tag = rarityTag(card.printing?.rarity);
    this.element.replaceChildren(
      h("button", { class: "icon-button sheet-close", "aria-label": "Close", onclick: () => this.onClose() }, icon("close")),
      h(
        "div",
        { class: "detail-scroll" },
        art,
        h("h2", { class: "card-name", text: info.name }),
        h("div", { class: `type-tag frame-${frameOf(info)}`, text: `[${typeLine(info)}]` }),
        stats.length ? h("div", { class: "stats", text: stats.join("  ·  ") }) : null,
        info.pendulumText ? h("p", { class: "card-text pendulum", text: info.pendulumText }) : null,
        h("p", { class: "card-text", text: info.text || "No card text." }),
        h(
          "section",
          { class: "copy" },
          h(
            "h3",
            {},
            "Your copy",
            tag ? h("span", { class: "rarity-chip", text: tag }) : null,
            h("small", { text: `Page ${pageOfSlot(card.slot) + 1} · pocket ${pocketOfSlot(card.slot) + 1}` })
          ),
          copyFields(this.getCatalog(), info, { ...card }, (patch) => this.store.updateCard(card.id, patch)),
          h(
            "div",
            { class: "detail-actions" },
            field("Binder", move),
            h(
              "button",
              {
                class: "button danger",
                onclick: () => {
                  if (confirm(`Remove ${info.name} from this binder?`)) this.store.removeCard(card.id);
                },
              },
              icon("trash", "Remove")
            )
          )
        )
      )
    );
  }

  private empty(binder: Binder) {
    const cards = this.store.cardsOf(binder.id);
    const unique = new Set(cards.map((card) => card.card.catalogId)).size;
    this.element.replaceChildren(
      h(
        "div",
        { class: "detail-scroll empty-state" },
        h("div", { class: "empty-cover", style: `--cover:${binder.coverColor}` }),
        h("h2", { class: "card-name", text: binder.name }),
        h("p", { class: "stats", text: `${cards.length} cards · ${unique} different` }),
        h(
          "p",
          { class: "card-text" },
          "Tap a card to see it here. Tap an empty pocket to add a card there. Drag a card (long-press on touch screens) to move it; hold it at the page edge to turn the page."
        )
      )
    );
  }

  /** Re-renders if the shown copy changed or disappeared. */
  refresh(binder: Binder) {
    if (!this.current) return this.empty(binder);
    const card = this.store.cards.get(this.current.id);
    if (!card || card.deleted || card.binderId !== binder.id) this.show(null, binder);
    else if (card.slot !== this.current.slot) this.show(card, binder);
  }
}
