// Copy / cut / paste of cards between pockets: keyboard shortcuts, the long-press menu and the replace confirmation.

import type { NewCopy } from "../data/store.ts";
import type { BinderCard, CardSnapshot } from "../model/types.ts";
import { t } from "../i18n.ts";
import { dialogShell, h, openDialog } from "./dom.ts";

export interface ClipboardItem {
  card: CardSnapshot;
  copy: NewCopy;
}

/** What is copied: the card and everything specific to this copy (printing, artwork, condition...). */
export const clipItem = (card: BinderCard): ClipboardItem => ({
  card: card.card,
  copy: {
    printing: card.printing ? { ...card.printing } : null,
    artworkId: card.artworkId ?? null,
    condition: card.condition,
    language: card.language,
    edition: card.edition,
    notes: card.notes,
  },
});

/** Small confirmation box before a pasted card replaces the one in the pocket. */
export function confirmReplace(oldName: string, newName: string): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const replace = h("button", {
      class: "button primary",
      text: t("Replace"),
      onclick: () => {
        answer = true;
        dialog.close();
      },
    });
    const dialog = dialogShell(
      t("Replace this card?"),
      h("p", { class: "confirm-text", text: t("{old} will be removed from this pocket and replaced by a copy of {new}.", { old: oldName, new: newName }) }),
      h("div", { class: "dialog-actions" }, h("button", { class: "button", text: t("Cancel"), onclick: () => dialog.close() }), replace)
    );
    dialog.classList.add("small-dialog");
    dialog.addEventListener("close", () => resolve(answer), { once: true });
    openDialog(dialog);
    replace.focus();
  });
}

export interface MenuItem {
  label: string;
  hint?: string;
  run: () => void;
}

let openContext: HTMLElement | null = null;

export function closeContextMenu() {
  openContext?.remove();
  openContext = null;
}

/** Floating menu next to a pocket (long press or right click). */
export function showContextMenu(x: number, y: number, items: MenuItem[]) {
  closeContextMenu();
  if (!items.length) return;
  const menu = h(
    "div",
    { class: "context-menu panel", role: "menu" },
    ...items.map((item) =>
      h(
        "button",
        {
          class: "context-item",
          role: "menuitem",
          onclick: () => {
            closeContextMenu();
            item.run();
          },
        },
        h("span", { text: item.label }),
        item.hint ? h("kbd", { text: item.hint }) : null
      )
    )
  );
  document.body.append(menu);
  const box = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x - box.width / 2, window.innerWidth - box.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y - box.height - 16, window.innerHeight - box.height - 8))}px`;
  openContext = menu;
  const dismiss = (event: Event) => {
    if (event instanceof KeyboardEvent ? event.key !== "Escape" : menu.contains(event.target as Node)) return;
    closeContextMenu();
    window.removeEventListener("pointerdown", dismiss, true);
    window.removeEventListener("keydown", dismiss, true);
  };
  window.addEventListener("pointerdown", dismiss, true);
  window.addEventListener("keydown", dismiss, true);
}
