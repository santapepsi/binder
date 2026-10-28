// Settings: the card database on this device, and the account used for sync.

import type { Catalog } from "../data/catalog.ts";
import { cardBackBlob, type TableStore } from "../data/table.ts";
import { COVER_FONT, paintCardBack } from "../three/paint.ts";
import { coverFontBlob, setCoverFont } from "../data/coverFont.ts";
import { saveSettings, trimUrl, type Settings } from "../data/settings.ts";
import type { Sync, SyncStatus } from "../sync/sync.ts";
import { dialogShell, field, h, openDialog } from "./dom.ts";
import { LANGUAGE_NAMES, binderName, language, locale, setLanguage, t, type Language } from "../i18n.ts";

export function describeStatus(status: SyncStatus): string {
  switch (status.state) {
    case "disabled":
      return t("Sync is not set up — binders are saved on this device.");
    case "signed-out":
      return t("Signed out — binders are saved on this device.");
    case "offline":
      return t("Offline — changes will sync when you reconnect.");
    case "syncing":
      return t("Syncing…");
    case "synced":
      return t("Synced at {time}.", { time: new Date(status.at).toLocaleTimeString(locale() ?? [], { hour: "2-digit", minute: "2-digit" }) });
    case "error":
      return t("Sync problem: {message}", { message: status.message });
  }
}

export function openSettings(settings: Settings, sync: Sync, catalog: Catalog, table: TableStore, onSaved: (settings: Settings) => void) {
  const catalogStatus = h("p", { class: "muted" });
  const describeCatalog = () => {
    const info = catalog.info();
    catalogStatus.textContent = info.cards
      ? t("{n} cards on this device, downloaded {date}.", { n: info.cards, date: new Date(info.updatedAt!).toLocaleDateString(locale()) })
      : t("Not downloaded yet. It downloads the first time you add a card.");
  };
  const update = h("button", { class: "button ghost", type: "button", text: t("Check for updates") });
  update.addEventListener("click", async () => {
    update.disabled = true;
    try {
      const progress = ({ phase, bytes }: { phase: string; bytes?: number }) =>
        (catalogStatus.textContent =
          phase === "downloading"
            ? t("Downloading… {mb} MB", { mb: ((bytes ?? 0) / 1048576).toFixed(1) })
            : phase === "saving"
              ? t("Saving…")
              : t("Checking…"));
      if (!catalog.ready) await catalog.ensure(progress);
      const changed = await catalog.refreshIfChanged(progress);
      describeCatalog();
      if (!changed) catalogStatus.textContent += t(" It is up to date.");
    } catch (error) {
      catalogStatus.textContent = t("Could not update: {error}", { error: (error as Error).message });
    } finally {
      update.disabled = false;
    }
  });
  catalog.ensure().then(describeCatalog, describeCatalog);
  describeCatalog();

  const supabaseUrl = h("input", { type: "url", value: settings.supabaseUrl, placeholder: "https://xxxx.supabase.co", spellcheck: false });
  const supabaseKey = h("input", { type: "text", value: settings.supabaseKey, placeholder: t("Publishable (anon) key"), spellcheck: false });
  const email = h("input", { type: "email", placeholder: t("Email"), autocomplete: "email" });
  const password = h("input", { type: "password", placeholder: t("Password"), autocomplete: "current-password" });
  const account = h("div", { class: "account" });
  const status = h("p", { class: "muted", text: describeStatus(sync.status) });
  const warning = h("p", { class: "warning" });
  const showStatus = () => {
    status.textContent = describeStatus(sync.status);
    warning.textContent = sync.schemaWarning ?? "";
    warning.hidden = !sync.schemaWarning;
  };
  sync.addEventListener("status", showStatus);
  showStatus();

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
    status.textContent = t("Working…");
    try {
      await action();
      renderAccount();
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  };

  const renderAccount = () => {
    if (!sync.configured) {
      account.replaceChildren(h("p", { class: "muted", text: t("Fill in your Supabase project to sign in and sync between web and Android.") }));
    } else if (sync.email) {
      account.replaceChildren(
        h("p", { text: t("Signed in as {email}", { email: sync.email }) }),
        h(
          "div",
          { class: "dialog-actions" },
          h("button", { class: "button ghost", type: "button", text: t("Sync now"), onclick: () => attempt(() => sync.syncNow()) }),
          h("button", { class: "button ghost", type: "button", text: t("Sign out"), onclick: () => attempt(() => sync.signOut()) })
        )
      );
    } else {
      account.replaceChildren(
        h("div", { class: "field-row" }, email, password),
        h(
          "div",
          { class: "dialog-actions" },
          h("button", { class: "button primary", type: "button", text: t("Sign in"), onclick: () => attempt(() => sync.signIn(email.value.trim(), password.value)) }),
          h(
            "button",
            {
              class: "button ghost",
              type: "button",
              text: t("Create account"),
              onclick: () =>
                attempt(async () => {
                  const signedIn = await sync.signUp(email.value.trim(), password.value);
                  if (!signedIn) status.textContent = t("Check your email to confirm the account, then sign in.");
                }),
            }
          )
        )
      );
    }
  };
  renderAccount();
  for (const input of [supabaseUrl, supabaseKey]) input.addEventListener("change", () => (persist(), renderAccount()));

  // Card back used for cards lying face down on the table.
  const backPreview = h("div", { class: "back-preview" });
  const showBack = async () => {
    const blob = await cardBackBlob();
    if (blob) {
      const url = URL.createObjectURL(blob);
      backPreview.replaceChildren(h("img", { src: url, alt: t("Card back"), onload: () => URL.revokeObjectURL(url) }));
    } else backPreview.replaceChildren(paintCardBack(160));
  };
  showBack();
  const backFile = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp" });
  backFile.addEventListener("change", async () => {
    const file = backFile.files?.[0];
    if (file) await table.setCardBack(file);
    showBack();
  });
  const backReset = h("button", { class: "button ghost", type: "button", text: t("Use the default back") });
  backReset.addEventListener("click", async () => {
    await table.setCardBack(null);
    backFile.value = "";
    showBack();
  });

  // Font for the lettering on binder covers.
  const fontSample = h("p", { class: "font-sample", text: binderName({ name: "Normal Monsters" }) });
  fontSample.style.fontFamily = COVER_FONT;
  const fontStatus = h("small", { class: "muted" });
  const showFont = async () => {
    fontStatus.textContent = (await coverFontBlob())
      ? t("Using your font. It is kept on this device and in your account, not published with the app.")
      : t("Using the app font. Load a .ttf or .otf file to use another one.");
  };
  showFont();
  window.addEventListener("coverfont", showFont);
  const fontFile = h("input", { type: "file", accept: ".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" });
  fontFile.addEventListener("change", async () => {
    const file = fontFile.files?.[0];
    if (!file) return;
    try {
      await setCoverFont(file);
    } catch {
      fontStatus.textContent = t("That file is not a font this browser can read.");
      return;
    }
    showFont();
  });
  const fontReset = h("button", { class: "button ghost", type: "button", text: t("Use the app font") });
  fontReset.addEventListener("click", async () => {
    await setCoverFont(null);
    fontFile.value = "";
    showFont();
  });

  // Interface language: English or Japanese. Changing it reloads the app.
  const languageSelect = h("select", { "aria-label": t("Interface language") });
  for (const [value, name] of Object.entries(LANGUAGE_NAMES))
    languageSelect.append(h("option", { value, text: name, selected: value === language }));
  languageSelect.addEventListener("change", () => {
    persist();
    setLanguage(languageSelect.value as Language);
  });

  const dialog = dialogShell(
    t("Settings"),
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: t("Language") }),
      field(t("Interface language"), languageSelect),
      h("small", { class: "muted", text: t("Card names and texts come from YGOPRODeck, which has them in English only.") })
    ),
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: t("Cover lettering") }),
      fontSample,
      field(t("Font file"), fontFile),
      fontStatus,
      h("div", { class: "dialog-actions start" }, fontReset)
    ),
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: t("Card back") }),
      h("div", { class: "back-row" }, backPreview, h("div", {}, field(t("Picture for face-down cards"), backFile), backReset))
    ),
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: t("Card database") }),
      catalogStatus,
      h("div", { class: "dialog-actions start" }, update)
    ),
    h(
      "section",
      { class: "settings-section" },
      h("h3", { text: t("Account & sync") }),
      h("div", { class: "field-row" }, field("Supabase URL", supabaseUrl), field(t("Key"), supabaseKey)),
      account,
      status,
      warning
    ),
    h(
      "p",
      { class: "credits" },
      t("Card texts and images come from YGOPRODeck. Yu-Gi-Oh! is a trademark of Konami; this app is not affiliated with Konami.")
    )
  );
  dialog.addEventListener("close", persist);
  openDialog(dialog);
}
