// Dropdown under the shelf button: Binders and Deckboxes.

import type { Deck, DeckStore } from "../data/decks.ts";
import { coverImage } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import type { Binder } from "../model/types.ts";
import { deckboxIcon, h, icon, nodes } from "./dom.ts";
import { openBinderEditor } from "./shelfDialog.ts";
import { binderName, plural, t } from "../i18n.ts";

export interface MenuOptions {
  anchor: HTMLElement;
  store: Store;
  decks: DeckStore;
  current: { binder: string | null; deck: string | null };
  open: "binders" | "deckboxes";
  onBinder: (binder: Binder) => void;
  onDeck: (deck: Deck) => void;
}

let openMenu: HTMLElement | null = null;

export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}

export function toggleMenu(options: MenuOptions) {
  if (openMenu) return closeMenu();
  const { store, decks } = options;
  let section = options.open;
  const menu = h("div", { class: "dropdown panel", role: "menu" });

  const sectionButton = (key: "binders" | "deckboxes", label: string, count: number) =>
    h(
      "button",
      {
        class: `dropdown-section${section === key ? " open" : ""}`,
        "aria-expanded": String(section === key),
        onclick: () => {
          section = key;
          render();
        },
      },
      h("span", { text: label }),
      h("span", { class: "dropdown-count", text: String(count) }),
      h("span", { class: "caret", text: section === key ? "▾" : "▸" })
    );

  const binderList = () =>
    h(
      "ul",
      { class: "shelf" },
      ...store.liveBinders().map((binder) => {
        const count = store.cardsOf(binder.id).length;
        const spine = h("span", { class: "shelf-cover", style: `--cover:${binder.coverColor}` });
        if (binder.coverImage)
          coverImage(binder.id).then((bitmap) => {
            if (!bitmap) return;
            const canvas = h("canvas", { width: 80, height: 100 });
            const context = canvas.getContext("2d")!;
            const scale = Math.max(80 / bitmap.width, 100 / bitmap.height);
            context.drawImage(bitmap, (80 - bitmap.width * scale) / 2, (100 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
            spine.append(canvas);
          });
        return h(
          "li",
          { class: binder.id === options.current.binder ? "current" : "" },
          h(
            "button",
            {
              class: "shelf-pick",
              role: "menuitem",
              onclick: () => {
                closeMenu();
                options.onBinder(binder);
              },
            },
            spine,
            h("span", { class: "shelf-name", text: binderName(binder) }),
            h("span", { class: "shelf-count", text: plural(count, "{n} card", "{n} cards") })
          ),
          h(
            "button",
            {
              class: "icon-button",
              "aria-label": t("Edit {name}", { name: binderName(binder) }),
              onclick: () => {
                closeMenu();
                openBinderEditor(store, binder);
              },
            },
            icon("edit")
          )
        );
      })
    );

  const deckList = () =>
    h(
      "ul",
      { class: "shelf" },
      ...decks.live().map((deck) =>
        h(
          "li",
          { class: deck.id === options.current.deck ? "current" : "" },
          h(
            "button",
            {
              class: "shelf-pick",
              role: "menuitem",
              onclick: () => {
                closeMenu();
                options.onDeck(deck);
              },
            },
            deckboxIcon(),
            h("span", { class: "shelf-name", text: deck.name }),
            h("span", { class: "shelf-count", text: `${deck.main.length} · ${deck.extra.length} · ${deck.side.length}` })
          )
        )
      ),
      h(
        "li",
        {},
        h(
          "button",
          {
            class: "shelf-pick new-deck",
            role: "menuitem",
            onclick: async () => {
              closeMenu();
              options.onDeck(await decks.create(t("Deck {n}", { n: decks.live().length + 1 })));
            },
          },
          icon("plus"),
          h("span", { class: "shelf-name", text: t("New deck") })
        )
      )
    );

  const render = () => {
    menu.replaceChildren(...nodes(
      sectionButton("binders", t("Binders"), store.liveBinders().length),
      section === "binders" ? binderList() : null,
      sectionButton("deckboxes", t("Deckboxes"), decks.live().length),
      section === "deckboxes" ? deckList() : null
    ));
  };
  render();

  const rect = options.anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.left)}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  document.body.append(menu);
  openMenu = menu;
  const away = (event: Event) => {
    if (!openMenu) return document.removeEventListener("pointerdown", away, true);
    if (!menu.contains(event.target as Node) && !options.anchor.contains(event.target as Node)) {
      closeMenu();
      document.removeEventListener("pointerdown", away, true);
    }
  };
  document.addEventListener("pointerdown", away, true);
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeMenu();
      document.removeEventListener("keydown", escape, true);
    }
  };
  document.addEventListener("keydown", escape, true);
}
