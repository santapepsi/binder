// Settings: where the catalog comes from, and the account used for sync.

import { CardmaticaCatalog } from "../data/catalog.ts";
import { saveSettings, trimUrl, type Settings } from "../data/settings.ts";
import type { Sync, SyncStatus } from "../sync/sync.ts";
import { dialogShell, field, h, openDialog } from "./dom.ts";

export function describeStatus(status: SyncStatus): string {
  switch (status.state) {
    case "disabled":
      return "Sync is not set up — binders are saved on this device.";
    case "signed-out":
      return "Signed out — binders are saved on this device.";
    case "offline":
      return "Offline — changes will sync when you reconnect.";
    case "syncing":
      return "Syncing…";
    case "synced":
      return `Synced at ${new Date(status.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
    case "error":
      return `Sync problem: ${status.message}`;
  }
}

export function openSettings(settings: Settings, sync: Sync, onSaved: (settings: Settings) => void) {
  const catalogUrl = h("input", { type: "url", value: settings.catalogUrl, placeholder: "http://192.168.1.20:8000", spellcheck: false });
  const catalogStatus = h("small", { class: "muted" });
  const test = h("button", { class: "button ghost", type: "button", text: "Test" });
  test.addEventListener("click", async () => {
    const url = trimUrl(catalogUrl.value);
    if (!url) return (catalogStatus.textContent = "Empty: the built-in demo catalog is used.");
    catalogStatus.textContent = "Checking…";
    try {
      const { total } = await new CardmaticaCatalog(url).search("", 1);
      catalogStatus.textContent = `Connected: ${total.toLocaleString()} cards.`;
    } catch (error) {
      catalogStatus.textContent = `Could not connect (${(error as Error).message}). Check the address and that Cardmática allows this app in CORS_ORIGINS.`;
    }
  });

  const supabaseUrl = h("input", { type: "url", value: settings.supabaseUrl, placeholder: "https://xxxx.supabase.co", spellcheck: false });
  const supabaseKey = h("input", { type: "text", value: settings.supabaseKey, placeholder: "Publishable (anon) key", spellcheck: false });
  const email = h("input", { type: "email", placeholder: "Email", autocomplete: "email" });
  const password = h("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
  const account = h("div", { class: "account" });
  const status = h("p", { class: "muted", text: describeStatus(sync.status) });
  sync.addEventListener("status", () => (status.textContent = describeStatus(sync.status)));

  const collect = (): Settings => ({
    catalogUrl: trimUrl(catalogUrl.value),
    supabaseUrl: trimUrl(supabaseUrl.value),
    supabaseKey: supabaseKey.value.trim(),
  });
  const persist = () => {
    const next = collect();
    saveSettings(next);
    onSaved(next);
    return next;
  };

  const attempt = async (action: () => Promise<unknown>) => {
    persist();
    status.textContent = "Working…";
    try {
      await action();
      renderAccount();
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  };

  const renderAccount = () => {
    if (!sync.configured) {
      account.replaceChildren(h("p", { class: "muted", text: "Fill in your Supabase project to sign in and sync between web and Android." }));
    } else if (sync.email) {
      account.replaceChildren(
        h("p", { text: `Signed in as ${sync.email}` }),
        h(
          "div",
          { class: "dialog-actions" },
          h("button", { class: "button ghost", type: "button", text: "Sync now", onclick: () => attempt(() => sync.syncNow()) }),
          h("button", { class: "button ghost", type: "button", text: "Sign out", onclick: () => attempt(() => sync.signOut()) })
        )
      );
    } else {
      account.replaceChildren(
        h("div", { class: "field-row" }, email, password),
        h(
          "div",
          { class: "dialog-actions" },
          h("button", { class: "button primary", type: "button", text: "Sign in", onclick: () => attempt(() => sync.signIn(email.value.trim(), password.value)) }),
          h(
            "button",
            {
              class: "button ghost",
              type: "button",
              text: "Create account",
              onclick: () =>
                attempt(async () => {
                  const signedIn = await sync.signUp(email.value.trim(), password.value);
                  if (!signedIn) status.textContent = "Check your email to confirm the account, then sign in.";
                }),
            }
          )
        )
      );
    }
  };
  renderAccount();
  for (const input of [supabaseUrl, supabaseKey]) input.addEventListener("change", () => (persist(), renderAccount()));

  const dialog = dialogShell(
    "Settings",
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: "Card catalog" }),
      field("Cardmática server", h("div", { class: "color-row" }, catalogUrl, test), "Leave empty to use the small demo catalog."),
      catalogStatus
    ),
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: "Account & sync" }),
      h("div", { class: "field-row" }, field("Supabase URL", supabaseUrl), field("Key", supabaseKey)),
      account,
      status
    ),
    h(
      "p",
      { class: "credits" },
      "Card data and images come from Cardmática, which maintains them from YGOPRODeck. Yu-Gi-Oh! is a trademark of Konami; this app is not affiliated with Konami."
    )
  );
  dialog.addEventListener("close", persist);
  openDialog(dialog);
}
