// Deck editor in the style of the Tag Force deck screen: card on the left,
// deck name and owned card types on top, Deck / Extra / Side / Binders tabs and
// a grid of cards. "Binders" lists every card in every binder and on the table.

import { COPIES_PER_CARD, LIMITS, MAIN_MINIMUM, isExtraDeckCard, toYdk, type Deck, type DeckEntry, type DeckStore, type DeckZone } from "../data/decks.ts";
import { cardImage, type Drawable } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import type { TableStore } from "../data/table.ts";
import { frameOf, typeLine } from "../model/classify.ts";
import type { CardSnapshot } from "../model/types.ts";
import { deckboxIcon, h, icon, nodes, toast } from "./dom.ts";
import type { Catalog } from "../data/catalog.ts";
import { openDeckCardPicker } from "./deckCardPicker.ts";
import { t, translateTypeLine } from "../i18n.ts";

type Tab = DeckZone | "binders";

interface Owned {
  catalogId: string;
  artworkId: string | null;
  card: CardSnapshot;
  count: number;
}

const COLUMNS = 10;
const THUMBS = new Map<string, Drawable>();
const FRAME_ORDER = ["normal", "effect", "ritual", "fusion", "synchro", "xyz", "link", "token", "skill", "spell", "trap"];

/** Every card the user owns: copies in all binders plus cards lying on the table. */
export function ownedCards(store: Store, table: TableStore): Map<string, Owned> {
  const owned = new Map<string, Owned>();
  const add = (card: CardSnapshot, artworkId: string | null | undefined) => {
    const entry = owned.get(card.catalogId);
    if (entry) entry.count++;
    else owned.set(card.catalogId, { catalogId: card.catalogId, artworkId: artworkId ?? null, card, count: 1 });
  };
  for (const copy of store.cards.values()) if (!copy.deleted && store.binders.get(copy.binderId)?.deleted !== true) add(copy.card, copy.artworkId);
  for (const slot of table.slots) if (slot.card) add(slot.card, slot.artworkId);
  return owned;
}

/** Deck order: monsters by frame then level (high first), then spells, then traps; name breaks ties. */
function compareCards(a: CardSnapshot, b: CardSnapshot) {
  const frame = FRAME_ORDER.indexOf(frameOf(a)) - FRAME_ORDER.indexOf(frameOf(b));
  if (frame) return frame;
  const level = (b.level ?? b.rank ?? b.linkRating ?? 0) - (a.level ?? a.rank ?? a.linkRating ?? 0);
  return level || a.name.localeCompare(b.name);
}

export class DeckView {
  readonly element = h("div", { class: "deck-view" });
  private deck: Deck | null = null;
  private tab: Tab = "main";
  private selected: { tab: Tab; index: number } | null = null;
  private query = "";
  private sort: "type" | "name" | "atk" = "type";
  private owned = new Map<string, Owned>();
  private readonly detail = h("aside", { class: "deck-detail" });
  private readonly grid = h("div", { class: "deck-grid", role: "grid" });
  private readonly rows = h("div", { class: "deck-rows", "aria-hidden": "true" });
  private readonly nameInput = h("input", { class: "deck-name", type: "text", maxlength: 40, "aria-label": t("Deck name") });
  private readonly ownedCount = h("span", { class: "owned-number" });
  private readonly tabs = h("div", { class: "deck-tabs", role: "tablist" });
  private readonly toolbar = h("div", { class: "deck-toolbar" });
  private readonly status = h("div", { class: "deck-status" });
  private readonly observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement & { draw?: () => void };
      this.observer.unobserve(element);
      element.draw?.();
    }
  });

  constructor(
    private readonly store: Store,
    private readonly table: TableStore,
    private readonly decks: DeckStore,
    private readonly catalog: Catalog,
    private readonly onClose: () => void
  ) {
    this.nameInput.addEventListener("change", () => this.deck && this.decks.rename(this.deck.id, this.nameInput.value));
    this.element.append(
      this.detail,
      h(
        "section",
        { class: "deck-main" },
        h(
          "div",
          { class: "deck-top" },
          this.nameInput,
          h("div", { class: "owned" }, h("span", { class: "owned-label", text: t("Card types owned") }), this.ownedCount)
        ),
        this.tabs,
        h("div", { class: "deck-board" }, this.rows, this.grid),
        this.toolbar
      )
    );
    decks.addEventListener("change", () => this.deck && this.refresh());
    store.addEventListener("change", () => this.deck && this.refresh());
    table.addEventListener("change", () => this.deck && this.refresh());
    this.element.addEventListener("keydown", (event) => this.onKey(event));
    // Row numbers line up with the card rows.
    new ResizeObserver(() => {
      const first = this.grid.firstElementChild as HTMLElement | null;
      if (first) this.rows.style.gridAutoRows = `${first.getBoundingClientRect().height}px`;
    }).observe(this.grid);
  }

  open(deck: Deck) {
    this.deck = deck;
    this.tab = "main";
    this.selected = null;
    this.query = "";
    this.refresh();
  }

  close() {
    this.deck = null;
  }

  get current() {
    return this.deck;
  }

  private refresh() {
    const deck = this.deck && this.decks.get(this.deck.id);
    if (!deck) {
      this.onClose();
      return;
    }
    this.deck = deck;
    this.owned = ownedCards(this.store, this.table);
    if (document.activeElement !== this.nameInput) this.nameInput.value = deck.name;
    this.ownedCount.textContent = this.owned.size.toLocaleString();
    this.renderTabs();
    this.renderGrid();
    this.renderToolbar();
    this.renderDetail();
  }

  // ---------------------------------------------------------------- tabs

  private renderTabs() {
    const deck = this.deck!;
    const total = [...this.owned.values()].reduce((sum, entry) => sum + entry.count, 0);
    const tab = (key: Tab, label: string, count: number) =>
      h(
        "button",
        {
          class: `deck-tab${this.tab === key ? " active" : ""}`,
          role: "tab",
          "aria-selected": String(this.tab === key),
          onclick: () => {
            this.tab = key;
            this.selected = null;
            this.refresh();
          },
        },
        h("span", { class: "tab-label", text: label }),
        h("span", { class: "tab-count", text: count.toLocaleString() })
      );
    this.tabs.replaceChildren(
      tab("main", t("Deck"), deck.main.length),
      tab("extra", t("Extra"), deck.extra.length),
      tab("side", t("Side"), deck.side.length),
      tab("binders", t("Binders"), total)
    );
  }

  // ---------------------------------------------------------------- grid

  /** Cards shown in the current tab, with where each comes from. */
  private items(): { card: CardSnapshot; artworkId: string | null; count?: number; used?: number; index: number }[] {
    const deck = this.deck!;
    if (this.tab !== "binders") {
      return deck[this.tab]
        .map((entry, index) => ({ card: entry.card, artworkId: entry.artworkId, index }))
        .sort((a, b) => compareCards(a.card, b.card));
    }
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = [...this.owned.values()].filter((entry) => words.every((word) => entry.card.name.toLowerCase().includes(word)));
    list.sort((a, b) =>
      this.sort === "name"
        ? a.card.name.localeCompare(b.card.name)
        : this.sort === "atk"
          ? Number(b.card.atk ?? -1) - Number(a.card.atk ?? -1) || a.card.name.localeCompare(b.card.name)
          : compareCards(a.card, b.card)
    );
    return list.map((entry, index) => ({
      card: entry.card,
      artworkId: entry.artworkId,
      count: entry.count,
      used: this.decks.copiesIn(deck, entry.catalogId),
      index,
    }));
  }

  private shown: ReturnType<DeckView["items"]> = [];

  private renderGrid() {
    this.shown = this.items();
    const cells = this.shown.map((item, position) => {
      const canvas = h("canvas", { width: 118, height: 172 }) as HTMLCanvasElement;
      const cell = h(
        "button",
        {
          class: `deck-card${this.isSelected(item.index) ? " selected" : ""}${item.used !== undefined && item.used >= Math.min(COPIES_PER_CARD, item.count ?? 0) ? " used-up" : ""}`,
          title: item.card.name,
          role: "gridcell",
          onclick: () => this.select(item.index),
          ondblclick: () => this.primaryAction(),
        },
        canvas,
        item.count !== undefined ? h("span", { class: "copies", text: `×${item.count}` }) : null,
        item.used ? h("span", { class: "in-deck", text: String(item.used) }) : null
      ) as HTMLButtonElement & { draw?: () => void };
      const key = `${item.card.catalogId}|${item.artworkId ?? ""}`;
      const paint = (image: Drawable) => canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
      const cached = THUMBS.get(key);
      // Already loaded cards are painted at once, so re-rendering the grid never blinks.
      if (cached) paint(cached);
      cell.draw = () =>
        cardImage(item.card, "thumb", item.artworkId).then((image) => {
          if (!("placeholder" in image && image.placeholder)) THUMBS.set(key, image);
          paint(image);
        });
      cell.dataset.position = String(position);
      if (!cached) this.observer.observe(cell);
      return cell;
    });
    const minimumRows = 4;
    const rowCount = Math.max(minimumRows, Math.ceil(cells.length / COLUMNS));
    for (let index = cells.length; index < rowCount * COLUMNS; index++) cells.push(h("span", { class: "deck-card empty", "aria-hidden": "true" }) as never);
    this.grid.replaceChildren(...cells);
    this.rows.replaceChildren(...Array.from({ length: rowCount }, (_, row) => h("span", { text: String(row * COLUMNS) })));
  }

  private isSelected(index: number) {
    return this.selected?.tab === this.tab && this.selected.index === index;
  }

  private select(index: number) {
    this.selected = { tab: this.tab, index };
    for (const cell of this.grid.querySelectorAll(".deck-card.selected")) cell.classList.remove("selected");
    const position = this.shown.findIndex((item) => item.index === index);
    this.grid.children[position]?.classList.add("selected");
    this.renderDetail();
    this.renderToolbar();
  }

  private selectedItem() {
    if (!this.selected || this.selected.tab !== this.tab) return null;
    return this.shown.find((item) => item.index === this.selected!.index) ?? null;
  }

  // ---------------------------------------------------------------- actions

  private async addSelected(target: "deck" | "side") {
    const item = this.selectedItem();
    const deck = this.deck;
    if (!item || !deck) return;
    const owned = this.owned.get(item.card.catalogId)?.count ?? 0;
    const entry: DeckEntry = { catalogId: item.card.catalogId, artworkId: item.artworkId, card: item.card };
    const problem = await this.decks.add(deck.id, entry, target, owned);
    if (problem) toast(problem);
  }

  private async removeSelected() {
    const item = this.selectedItem();
    if (!item || !this.deck || this.tab === "binders") return;
    await this.decks.removeAt(this.deck.id, this.tab, item.index);
    this.selected = null;
  }

  private primaryAction() {
    if (this.tab === "binders") this.addSelected("deck");
    else this.removeSelected();
  }

  /** Add cards from the whole database, like adding to a binder. */
  private pickCard() {
    const deck = this.deck;
    if (!deck) return;
    const side = this.tab === "side";
    openDeckCardPicker(this.catalog, side ? "side" : "deck", (card) =>
      this.decks.add(deck.id, { catalogId: card.catalogId, artworkId: null, card }, side ? "side" : "deck", Infinity)
    );
  }

  private exportYdk() {
    if (!this.deck) return;
    const url = URL.createObjectURL(new Blob([toYdk(this.deck)], { type: "text/plain" }));
    const link = h("a", { href: url, download: `${this.deck.name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.ydk` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private renderToolbar() {
    const deck = this.deck!;
    const item = this.selectedItem();
    const button = (label: string, action: () => void, enabled = true, kind = "") =>
      h("button", { class: `deck-action ${kind}`, disabled: !enabled, onclick: action, text: label });
    const search = h("input", { type: "search", class: "deck-search", placeholder: t("Search your cards…"), value: this.query, "aria-label": t("Search your cards") });
    search.addEventListener("input", () => {
      this.query = search.value;
      this.renderGrid();
    });
    const sort = h("select", { class: "deck-sort", "aria-label": t("Sort") });
    for (const [value, label] of [["type", "Sort: type"], ["name", "Sort: name"], ["atk", "Sort: ATK"]] as const)
      sort.append(h("option", { value, text: t(label), selected: this.sort === value }));
    sort.addEventListener("change", () => {
      this.sort = sort.value as typeof this.sort;
      this.renderGrid();
    });
    const counts = (entries: DeckEntry[]) => {
      const kinds = { M: 0, S: 0, T: 0 };
      for (const entry of entries) kinds[entry.card.cardType === "Spell" ? "S" : entry.card.cardType === "Trap" ? "T" : "M"]++;
      return kinds;
    };
    const main = counts(deck.main);
    const problems = [
      deck.main.length < MAIN_MINIMUM ? t("Main Deck needs {n} more", { n: MAIN_MINIMUM - deck.main.length }) : null,
      deck.extra.length > LIMITS.extra ? t("Extra Deck over 15") : null,
    ].filter(Boolean);
    this.status.className = `deck-status${problems.length ? " invalid" : " valid"}`;
    this.status.textContent = t("Monsters {m} · Spells {s} · Traps {t} — {state}", { m: main.M, s: main.S, t: main.T, state: problems.length ? problems.join(", ") : t("Legal size") });

    this.toolbar.replaceChildren(...nodes(
      button(t("◀ Binders"), () => this.onClose(), true, "back"),
      button(t("+ Add card"), () => this.pickCard(), true, "add-card-button"),
      this.tab === "binders" ? search : null,
      this.tab === "binders" ? sort : null,
      h("span", { class: "spacer" }),
      this.tab === "binders"
        ? h(
            "span",
            { class: "deck-actions" },
            button(t("+ Deck"), () => this.addSelected("deck"), !!item),
            button(t("+ Side"), () => this.addSelected("side"), !!item)
          )
        : button(t("Remove"), () => this.removeSelected(), !!item),
      this.status,
      button(t("Export .ydk"), () => this.exportYdk(), deck.main.length + deck.extra.length + deck.side.length > 0, "ghost"),
      h(
        "button",
        {
          class: "deck-action danger",
          "aria-label": t("Delete deck"),
          title: t("Delete deck"),
          onclick: async () => {
            if (confirm(t('Delete the deck "{name}"?', { name: deck.name }))) await this.decks.remove(deck.id);
          },
        },
        icon("trash")
      )
    ));
  }

  // ---------------------------------------------------------------- detail

  private renderDetail() {
    const item = this.selectedItem();
    if (!item) {
      const deck = this.deck!;
      this.detail.replaceChildren(
        h("div", { class: "deck-detail-art empty" }, deckboxIcon(true)),
        h("h2", { class: "card-name", text: deck.name }),
        h(
          "p",
          { class: "card-text" },
          this.tab === "binders"
            ? t("Pick a card and press + Deck (or double-click it) to put it in the deck. Fusion, Synchro, Xyz and Link monsters go to the Extra Deck.")
            : t("Pick a card to see it here. Double-click it or press Remove to take it out of the deck.")
        )
      );
      return;
    }
    const info = item.card;
    const art = h("div", { class: "deck-detail-art" });
    cardImage(info, "full", item.artworkId).then((image) => {
      const canvas = h("canvas", { width: image.width, height: image.height });
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      art.replaceChildren(canvas);
    });
    const owned = this.owned.get(info.catalogId)?.count ?? 0;
    const inDeck = this.decks.copiesIn(this.deck!, info.catalogId);
    const stats =
      info.atk !== null ? (info.linkRating ? `ATK${info.atk} LINK-${info.linkRating}` : `ATK${info.atk} DEF${info.def ?? "?"}`) : null;
    this.detail.replaceChildren(
      art,...nodes(
      h(
        "div",
        { class: "deck-detail-stats" },
        stats ? h("span", { text: stats }) : null,
        h("span", { class: "owned-copies", text: `×${owned}` })
      ),
      h("h2", { class: "card-name", text: info.name }),
      h("div", { class: `type-tag frame-${frameOf(info)}`, text: `[${translateTypeLine(typeLine(info))}]` }),
      h("p", { class: "muted", text: t("In this deck: {n} · owned: {owned}", { n: inDeck, owned }) + (isExtraDeckCard(info) ? t(" · Extra Deck card") : "") }),
      info.pendulumText ? h("p", { class: "card-text pendulum", text: info.pendulumText }) : null,
      h("p", { class: "card-text", text: info.text || t("No card text.") })
    ));
  }

  private onKey(event: KeyboardEvent) {
    if ((event.target as HTMLElement).matches("input, select, textarea")) return;
    if (event.key === "Enter") this.primaryAction();
    else if (event.key === "Delete" || event.key === "Backspace") this.removeSelected();
    else return;
    event.preventDefault();
  }
}
