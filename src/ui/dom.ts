// Tiny DOM helpers and the dialog/toast plumbing shared by the UI.

type Props = Record<string, unknown> & { class?: string; text?: string };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") element.className = String(value);
    else if (key === "text") element.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function")
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key in element && typeof value !== "string") (element as unknown as Record<string, unknown>)[key] = value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  return element;
}

export const icon = (name: keyof typeof ICONS, label?: string) => {
  const span = h("span", { class: "icon", "aria-hidden": "true" });
  span.innerHTML = ICONS[name];
  return label ? h("span", { class: "with-label" }, span, h("span", { text: label })) : span;
};

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  prev: `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M15 4 6 12l9 8V4z" fill="currentColor"/><rect x="14" y="9" width="7" height="6" fill="currentColor"/></svg>`,
  next: `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 4l9 8-9 8V4z" fill="currentColor"/><rect x="3" y="9" width="7" height="6" fill="currentColor"/></svg>`,
  first: `<svg viewBox="0 0 32 24" width="34" height="26"><path d="M13 4 4 12l9 8V4zM26 4l-9 8 9 8V4z" fill="currentColor"/></svg>`,
  last: `<svg viewBox="0 0 32 24" width="34" height="26"><path d="M6 4l9 8-9 8V4zM19 4l9 8-9 8V4z" fill="currentColor"/></svg>`,
  leftPage: `<svg viewBox="0 0 32 24" width="34" height="26"><rect x="2" y="3" width="13" height="18" fill="currentColor" opacity=".9"/><rect x="17" y="3" width="13" height="18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 8h7M20 12h7M20 16h7M23.5 4v16" stroke="currentColor" stroke-width="1.4"/></svg>`,
  rightPage: `<svg viewBox="0 0 32 24" width="34" height="26"><rect x="2" y="3" width="13" height="18" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 8h7M5 12h7M5 16h7M8.5 4v16" stroke="currentColor" stroke-width="1.4"/><rect x="17" y="3" width="13" height="18" fill="currentColor" opacity=".9"/></svg>`,
  plus: svg(`<path d="M12 5v14M5 12h14"/>`),
  gear: svg(`<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/>`),
  shelf: svg(`<rect x="3" y="4" width="4" height="16" rx="1"/><rect x="9" y="4" width="4" height="16" rx="1"/><path d="m15.5 5.2 3.6-1 4 15.6-3.6 1z"/>`),
  close: svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
  edit: svg(`<path d="M4 20h4L19 9l-4-4L4 16z"/>`),
  trash: svg(`<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>`),
  cloud: svg(`<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>`),
  search: svg(`<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>`),
  back: svg(`<path d="M15 5 8 12l7 7"/>`),
  sticker: svg(`<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 10v4M12 10v4M10 12h-2M12 10h2.5a1.5 1.5 0 0 1 0 3H12M14 13l1.5 1"/>`),
  spot: svg(`<rect x="4" y="3" width="10" height="14" rx="1" transform="rotate(-12 9 10)"/><path d="M17 13v8M13 17h8"/>`),
};

// ---------------------------------------------------------------- dialogs

const openDialogs: HTMLDialogElement[] = [];

/** Opens a modal dialog; the Android back button (history) closes it. */
export function openDialog(dialog: HTMLDialogElement) {
  if (!dialog.isConnected) document.body.append(dialog);
  if (dialog.open) return;
  dialog.showModal();
  openDialogs.push(dialog);
  history.pushState({ dialog: true }, "");
  dialog.addEventListener(
    "close",
    () => {
      const index = openDialogs.indexOf(dialog);
      if (index >= 0) {
        openDialogs.splice(index, 1);
        if (history.state?.dialog) history.back();
      }
    },
    { once: true }
  );
}

window.addEventListener("popstate", () => {
  const top = openDialogs.pop();
  if (top?.open) top.close();
});

export function dialogShell(title: string, ...body: Node[]): HTMLDialogElement {
  const dialog = h("dialog", { class: "panel dialog" });
  const close = h("button", { class: "icon-button", "aria-label": "Close", onclick: () => dialog.close() }, icon("close"));
  dialog.append(h("div", { class: "dialog-inner" }, h("header", { class: "dialog-head" }, h("h2", { text: title }), close), ...body));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => setTimeout(() => dialog.remove(), 0));
  return dialog;
}

// ---------------------------------------------------------------- toast

let toastTimer = 0;
export function toast(message: string, action?: { label: string; run: () => void }) {
  let element = document.querySelector<HTMLElement>(".toast");
  if (!element) {
    element = h("div", { class: "toast panel", role: "status" });
    document.body.append(element);
  }
  element.replaceChildren(h("span", { text: message }));
  if (action)
    element.append(
      h("button", {
        class: "link-button",
        text: action.label,
        onclick: () => {
          action.run();
          element!.classList.remove("show");
        },
      })
    );
  element.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element!.classList.remove("show"), 4200);
}

export function field(label: string, control: HTMLElement, hint?: string) {
  return h("label", { class: "field" }, h("span", { class: "field-label", text: label }), control, hint ? h("small", { text: hint }) : null);
}

export function select(options: string[], value: string, onchange?: (value: string) => void) {
  const element = h("select", { onchange: () => onchange?.(element.value) });
  for (const option of options) element.append(h("option", { value: option, text: option, selected: option === value }));
  element.value = value;
  return element;
}

/** Children list without the empty (null/false) entries, for replaceChildren. */
export const nodes = (...items: (Node | string | null | undefined | false)[]) =>
  items.filter((item): item is Node | string => item !== null && item !== undefined && item !== false);
