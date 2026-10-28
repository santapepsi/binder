// Left panel (bottom sheet on phones): the selected card large, its text, and
// the details of your copy.

import type { Catalog } from "../data/catalog.ts";
import { cardImage, prefetchCard } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import { frameOf, typeLine } from "../model/classify.ts";
import { drawRarityBadge, rarityPicture } from "../model/rarityBadges.ts";
import { pageOfSlot, pocketOfSlot } from "../model/layout.ts";
import type { Binder, BinderCard } from "../model/types.ts";
import { copyFields } from "./copyFields.ts";
import { field, h, icon } from "./dom.ts";
import { binderName, t, translateTypeLine } from "../i18n.ts";

export class DetailPanel {
  readonly element = h("aside", { class: "detail panel", "aria-label": t("Card details") });
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
    cardImage(card.card, "full", card.artworkId).then((image) => {
      if (this.current?.id !== card.id) return;
      const canvas = h("canvas", { width: image.width, height: image.height, "aria-label": card.card.name });
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      art.replaceChildren(canvas);
    });
    const info = card.card;
    const stats = [
      info.level ? t("Level {n}", { n: String(info.level) }) : null,
      info.rank ? t("Rank {n}", { n: String(info.rank) }) : null,
      info.linkRating ? t("Link {n}", { n: String(info.linkRating) }) : null,
      info.pendulumScale !== null ? t("Scale {n}", { n: String(info.pendulumScale) }) : null,
      info.atk !== null ? t("ATK {n}", { n: String(info.atk) }) : null,
      info.def !== null && !info.linkRating ? t("DEF {n}", { n: String(info.def) }) : null,
    ].filter(Boolean);
    const others = this.store.liveBinders().filter((binder) => binder.id !== card.binderId);
    const move = h("select", { "aria-label": t("Move to binder") });
    move.append(h("option", { value: "", text: t("Move to…") }));
    others.forEach((binder) => move.append(h("option", { value: binder.id, text: binderName(binder) })));
    move.addEventListener("change", () => move.value && this.store.moveToBinder(card.id, move.value));
    const rarity = card.printing?.rarity;
    const picture = rarity ? rarityPicture(rarity) : null;
    const badge = !rarity
      ? null
      : picture
        ? h("img", { class: "rarity-badge", src: picture, alt: rarity, title: rarity })
        : Object.assign(drawRarityBadge(rarity), { className: "rarity-badge", title: rarity });
    this.element.replaceChildren(
      h("button", { class: "icon-button sheet-close", "aria-label": t("Close"), onclick: () => this.onClose() }, icon("close")),
      h(
        "div",
        { class: "detail-scroll" },
        art,
        h("h2", { class: "card-name", text: info.name }),
        h("div", { class: `type-tag frame-${frameOf(info)}`, text: `[${translateTypeLine(typeLine(info))}]` }),
        stats.length ? h("div", { class: "stats", text: stats.join("  ·  ") }) : null,
        info.pendulumText ? h("p", { class: "card-text pendulum", text: info.pendulumText }) : null,
        h("p", { class: "card-text", text: info.text || t("No card text.") }),
        h(
          "section",
          { class: "copy" },
          h(
            "h3",
            {},
            t("Your copy"),
            badge,
            h("small", { text: t("Page {page} · pocket {pocket}", { page: pageOfSlot(card.slot) + 1, pocket: pocketOfSlot(card.slot) + 1 }) })
          ),
          card.printing
            ? h(
                "label",
                { class: "check" },
                h("input", {
                  type: "checkbox",
                  checked: !card.printing.hideBadge,
                  onchange: (event: Event) => {
                    const current = this.store.cards.get(card.id);
                    if (!current?.printing) return;
                    const hideBadge = !(event.target as HTMLInputElement).checked;
                    this.store.updateCard(card.id, { printing: { ...current.printing, hideBadge } });
                  },
                }),
                h("span", { text: t("Show the rarity sticker on the pocket") })
              )
            : null,
          copyFields(this.getCatalog(), info, { ...card }, (patch) => {
            this.store.updateCard(card.id, patch);
            if ("printing" in patch) {
              const updated = this.store.cards.get(card.id);
              if (updated) this.show(updated, binder);
            }
            if ("artworkId" in patch) {
              prefetchCard(info, patch.artworkId).catch(() => undefined);
              const updated = this.store.cards.get(card.id);
              if (updated) this.show(updated, binder);
            }
          }),
          h(
            "div",
            { class: "detail-actions" },
            field(t("Binder"), move),
            h(
              "button",
              {
                class: "button danger",
                onclick: () => {
                  if (confirm(t("Remove {name} from this binder?", { name: info.name }))) this.store.removeCard(card.id);
                },
              },
              icon("trash", t("Remove"))
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
        h("h2", { class: "card-name", text: binderName(binder) }),
        h("p", { class: "stats", text: t("{n} cards · {unique} different", { n: cards.length, unique }) }),
        h(
          "p",
          { class: "card-text" },
          t("Tap a card to see it here. Tap an empty pocket to add a card there. Drag a card (long-press on touch screens) to move it; hold it at the page edge to turn the page.")
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
