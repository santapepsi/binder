// Settings: the card database on this device, and the account used for sync.

import type { Catalog } from "../data/catalog.ts";
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

export function openSettings(settings: Settings, sync: Sync, catalog: Catalog, onSaved: (settings: Settings) => void) {
  const catalogStatus = h("p", { class: "muted" });
  const describeCatalog = () => {
    const info = catalog.info();
    catalogStatus.textContent = info.cards
      ? `${info.cards.toLocaleString()} cards on this device, downloaded ${new Date(info.updatedAt!).toLocaleDateString()}.`
      : "Not downloaded yet. It downloads the first time you add a card.";
  };
  const update = h("button", { class: "button ghost", type: "button", text: "Check for updates" });
  update.addEventListener("click", async () => {
    update.disabled = true;
    try {
      const progress = ({ phase, bytes }: { phase: string; bytes?: number }) =>
        (catalogStatus.textContent =
          phase === "downloading" ? `Downloading… ${((bytes ?? 0) / 1048576).toFixed(1)} MB` : phase === "saving" ? "Saving…" : "Checking…");
      if (!catalog.ready) await catalog.ensure(progress);
      const changed = await catalog.refreshIfChanged(progress);
      describeCatalog();
      if (!changed) catalogStatus.textContent += " It is up to date.";
    } catch (error) {
      catalogStatus.textContent = `Could not update: ${(error as Error).message}`;
    } finally {
      update.disabled = false;
    }
  });
  catalog.ensure().then(describeCatalog, describeCatalog);
  describeCatalog();

  const supabaseUrl = h("input", { type: "url", value: settings.supabaseUrl, placeholder: "https://xxxx.supabase.co", spellcheck: false });
  const supabaseKey = h("input", { type: "text", value: settings.supabaseKey, placeholder: "Publishable (anon) key", spellcheck: false });
  const email = h("input", { type: "email", placeholder: "Email", autocomplete: "email" });
  const password = h("input", { type: "password", placeholder: "Password", autocomplete: "current-password" });
  const account = h("div", { class: "account" });
  const status = h("p", { class: "muted", text: describeStatus(sync.status) });
  sync.addEventListener("status", () => (status.textContent = describeStatus(sync.status)));

  const collect = (): Settings => ({
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
      h("h3", { text: "Card database" }),
      catalogStatus,
      h("div", { class: "dialog-actions start" }, update)
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
      "Card texts and images come from YGOPRODeck. Yu-Gi-Oh! is a trademark of Konami; this app is not affiliated with Konami."
    )
  );
  dialog.addEventListener("close", persist);
  openDialog(dialog);
}
