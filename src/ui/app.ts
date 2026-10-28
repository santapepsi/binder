// Wires the store, catalog, sync, 3D scene and the surrounding UI together.

import { Catalog } from "../data/catalog.ts";
import { loadSettings, type Settings } from "../data/settings.ts";
import { Store } from "../data/store.ts";
import { TableStore } from "../data/table.ts";
import { loadCoverFont } from "../data/coverFont.ts";
import { openSpotMenu } from "./tableDialogs.ts";
import { configureImages, persistStorage } from "../data/images.ts";
import * as db from "../data/db.ts";
import { pagesOfSpread } from "../model/layout.ts";
import type { Binder, BinderCard } from "../model/types.ts";
import { BinderScene, type ViewState } from "../three/binderScene.ts";
import { Sync } from "../sync/sync.ts";
import { openAddCard } from "./addCardDialog.ts";
import { DetailPanel } from "./detailPanel.ts";
import { h, icon, toast } from "./dom.ts";
import { describeStatus, openSettings } from "./settingsDialog.ts";
import { openBinderEditor } from "./shelfDialog.ts";
import { DeckStore, type Deck } from "../data/decks.ts";
import { DeckView } from "./deckView.ts";
import { closeMenu, toggleMenu } from "./menu.ts";
import { binderName, plural, t } from "../i18n.ts";

const portrait = () => window.innerWidth < 760 || window.innerWidth / window.innerHeight < 0.9;

export async function startApp(root: HTMLElement) {
  const store = new Store();
  await store.load();
  const table = new TableStore();
  await table.load();
  const decks = new DeckStore();
  await decks.load();
  // Covers and card faces are drawn on canvases: wait (briefly) for the fonts first.
  await Promise.race([
    Promise.all([...["32px Bia", "900 32px Nunito", "700 32px Nunito"].map((font) => document.fonts.load(font)), loadCoverFont()]),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]).catch(() => undefined);
  let settings: Settings = loadSettings();
  // ?debug&catalog=<url> loads a local test database instead of YGOPRODeck.
  const params = new URLSearchParams(location.search);
  const catalog = params.has("debug") && params.get("catalog") ? new Catalog(params.get("catalog")!) : new Catalog();
  const sync = new Sync(store, settings, table);
  sync.attachDecks(decks);
  configureImages(settings);
  persistStorage();

  const lastId = await db.get<string>("meta", "currentBinder").catch(() => undefined);
  let binder: Binder = store.binders.get(lastId ?? "") ?? store.liveBinders()[0];
  if (binder.deleted) binder = store.liveBinders()[0];

  // ---- layout
  let mode: "binder" | "deck" = "binder";
  const menuButton = h("button", { class: "icon-button menu-button", "aria-label": t("Binders and deckboxes"), "aria-haspopup": "menu" }, icon("shelf"));
  const openNavigation = () =>
    toggleMenu({
      anchor: menuButton,
      store,
      decks,
      current: { binder: mode === "binder" ? binder.id : null, deck: mode === "deck" ? deckView.current?.id ?? null : null },
      open: mode === "deck" ? "deckboxes" : "binders",
      onBinder: (next) => {
        showBinders();
        switchBinder(next);
      },
      onDeck: (deck) => showDeck(deck),
    });
  menuButton.addEventListener("click", openNavigation);
  const title = h("button", { class: "title-button", onclick: openNavigation });
  const summary = h("span", { class: "summary" });
  const syncDot = h("button", { class: "icon-button sync-dot", "aria-label": t("Sync status"), onclick: () => settingsDialog() }, icon("cloud"));
  const header = h(
    "header",
    { class: "topbar panel" },
    menuButton,
    title,
    summary,
    h("span", { class: "spacer" }),
    h("button", { class: "button primary add", onclick: () => addCard() }, icon("plus", t("Add card"))),
    h("button", { class: "icon-button", "aria-label": t("Edit binder"), onclick: () => openBinderEditor(store, binder) }, icon("edit")),
    h(
      "button",
      {
        class: "icon-button",
        "aria-label": t("Show or hide all rarity stickers"),
        title: t("Show or hide all rarity stickers"),
        onclick: async () => {
          const show = !store.anyBadgeVisible();
          await store.setAllBadges(show);
          toast(show ? t("Rarity stickers shown on every card.") : t("Rarity stickers hidden on every card."));
        },
      },
      icon("sticker")
    ),
    h(
      "button",
      {
        class: "icon-button",
        "aria-label": t("Add a card spot to the table"),
        title: t("Add a card spot to the table"),
        onclick: async () => {
          const spot = await table.add();
          if (scene.state.focus) scene.setFocus(null);
          openSpotMenu(table, catalog, spot.id, highlightSpot);
        },
      },
      icon("spot")
    ),
    syncDot,
    h("button", { class: "icon-button", "aria-label": t("Settings"), onclick: () => settingsDialog() }, icon("gear"))
  );

  const stage = h("main", { class: "stage" });
  const pageLabel = h("span", { class: "page-label", "aria-live": "polite" });
  const navButton = (name: Parameters<typeof icon>[0], label: string, action: () => void) =>
    h("button", { class: "nav-button", "aria-label": t(label), title: t(label), onclick: action }, icon(name));
  const leftFocus = navButton("leftPage", "Left page", () => toggleFocus("left"));
  const rightFocus = navButton("rightPage", "Right page", () => toggleFocus("right"));
  const pager = h(
    "nav",
    { class: "pager", "aria-label": t("Pages") },
    leftFocus,
    navButton("first", "First page", () => scene.first()),
    navButton("prev", "Previous page", () => scene.previous()),
    pageLabel,
    navButton("next", "Next page", () => scene.next()),
    navButton("last", "Last page", () => scene.last()),
    rightFocus
  );
  stage.append(pager);

  const detail = new DetailPanel(store, () => catalog, () => {
    scene.select(null);
    detail.show(null, binder);
  });
  const deckView = new DeckView(store, table, decks, catalog, () => showBinders());
  root.append(h("div", { class: "layout" }, header, detail.element, stage, deckView.element));

  function showDeck(deck: Deck) {
    mode = "deck";
    closeMenu();
    document.body.classList.add("deck-mode");
    deckView.open(deck);
    refreshHeader();
  }

  function showBinders() {
    if (mode === "binder") return;
    mode = "binder";
    deckView.close();
    document.body.classList.remove("deck-mode");
    refreshHeader();
  }
  decks.addEventListener("change", () => mode === "deck" && refreshHeader());

  // ---- scene
  const scene = new BinderScene(stage, {
    select: (card) => detail.show(card, binder),
    empty: (slot) => addCard(slot),
    move: (cardId, slot) => {
      store.moveCard(cardId, binder.id, slot).then(() => {
        const card = store.cards.get(cardId);
        if (card) detail.show(card, binder);
      });
    },
    view: (state) => updatePager(state),
    tableSlot: (id) => openSpotMenu(table, catalog, id, highlightSpot),
    tableMove: (id, x, z) => table.update(id, { x, z }),
  });
  scene.renderer.domElement.setAttribute("aria-label", t("3D binder. Use the arrow keys to turn pages."));
  if (portrait()) scene.setFocus("right");

  const refreshHeader = () => {
    const deck = mode === "deck" ? deckView.current : null;
    if (deck) {
      title.replaceChildren(h("span", { text: deck.name }), h("span", { class: "caret", text: "▾" }));
      summary.textContent = t("Deck {main} · Extra {extra} · Side {side}", { main: deck.main.length, extra: deck.extra.length, side: deck.side.length });
      return;
    }
    title.replaceChildren(h("span", { text: binderName(binder) }), h("span", { class: "caret", text: "▾" }));
    const cards = store.cardsOf(binder.id).length;
    summary.textContent = plural(cards, "{n} card", "{n} cards");
  };

  function updatePager(state: ViewState) {
    const number = (page: number | null) => (page !== null && page >= 0 ? page + 1 : null);
    let text: string;
    if (state.spread < 0) text = t("Cover");
    else {
      const { left, right } = pagesOfSpread(state.spread, state.pages);
      const shown =
        state.focus === "left" ? [number(left)] : state.focus === "right" ? [number(right)] : [number(left), number(right)];
      const pages = shown.filter((value) => value !== null);
      text = pages.length ? `${pages.join("–")} / ${state.pages}` : state.focus === "left" ? t("Inside cover") : t("End / {pages}", { pages: state.pages });
    }
    pageLabel.textContent = text;
    leftFocus.classList.toggle("active", state.focus === "left");
    rightFocus.classList.toggle("active", state.focus === "right");
  }

  function toggleFocus(side: "left" | "right") {
    const state = scene.state;
    if (portrait()) scene.setFocus(side);
    else scene.setFocus(state.focus === side ? null : side);
  }

  async function switchBinder(next: Binder) {
    binder = next;
    db.put("meta", [binder.id], ["currentBinder"]).catch(() => undefined);
    detail.show(null, binder);
    refreshHeader();
    await scene.setBinder(binder, store.cardsOf(binder.id));
    updatePager(scene.state);
  }

  function addCard(slot?: number) {
    openAddCard({
      store,
      catalog,
      binder,
      slot,
      onAdded: (card: BinderCard) => {
        const target = store.binders.get(card.binderId)!;
        if (target.id === binder.id) {
          scene.showSlot(card.slot);
          scene.select(card.slot);
          detail.show(card, binder);
        } else {
          toast(t("{name} went to {binder}.", { name: card.card.name, binder: binderName(target) }), {
            label: t("Open"),
            run: async () => {
              await switchBinder(target);
              scene.showSlot(card.slot);
              scene.select(card.slot);
              detail.show(card, target);
            },
          });
        }
      },
    });
  }

  function settingsDialog() {
    openSettings(settings, sync, catalog, table, (next) => {
      settings = next;
      sync.configure(settings);
      configureImages(settings);
    });
  }

  // ---- reactions
  store.addEventListener("change", (event) => {
    const ids = (event as CustomEvent<{ binderIds: string[] }>).detail.binderIds;
    const current = store.binders.get(binder.id);
    if (!current || current.deleted) {
      switchBinder(store.liveBinders()[0]);
      return;
    }
    binder = current;
    if (ids.includes(binder.id)) {
      scene.setCards(store.cardsOf(binder.id));
      scene.applyCover();
      detail.refresh(binder);
      updatePager(scene.state);
    }
    refreshHeader();
  });

  const showSync = () => {
    syncDot.dataset.state = sync.status.state === "synced" && sync.schemaWarning ? "error" : sync.status.state;
    syncDot.title = sync.schemaWarning ?? describeStatus(sync.status);
  };
  sync.addEventListener("status", showSync);
  showSync();

  window.addEventListener("keydown", (event) => {
    if (document.querySelector("dialog[open]") || mode === "deck") return;
    const target = event.target as HTMLElement;
    if (target.matches("input, textarea, select")) return;
    if (event.key === "ArrowRight") scene.next();
    else if (event.key === "ArrowLeft") scene.previous();
    else if (event.key === "Home") scene.first();
    else if (event.key === "End") scene.last();
    else if (event.key === "Escape") {
      scene.select(null);
      detail.show(null, binder);
    } else return;
    event.preventDefault();
  });

  const updateInsets = () => {
    const height = window.innerHeight;
    const side = portrait() ? 0 : detail.element.getBoundingClientRect().right + 8;
    scene.setInsets({
      left: Math.max(0, side),
      top: header.getBoundingClientRect().bottom + 4,
      bottom: Math.max(0, height - pager.getBoundingClientRect().top + 4),
    });
  };
  const insetObserver = new ResizeObserver(updateInsets);
  [header, pager, detail.element].forEach((element) => insetObserver.observe(element));
  window.addEventListener("resize", updateInsets);
  updateInsets();

  let wasPortrait = portrait();
  window.addEventListener("resize", () => {
    const now = portrait();
    if (now !== wasPortrait) scene.setFocus(now ? "right" : null);
    wasPortrait = now;
  });

  function highlightSpot(id: string, on: boolean) {
    scene.table.highlight(id, on);
  }
  // Covers are redrawn when the lettering font changes (loaded here or from the account).
  window.addEventListener("coverfont", () => scene.applyCover());
  scene.setTable(table.slots);
  table.addEventListener("change", () => scene.setTable(table.slots));
  await switchBinder(binder);
  sync.syncNow().catch(() => undefined);
  return { store, scene, table, sync, decks, deckView };
}
