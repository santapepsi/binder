// Account and sync over Supabase (Auth + PostgREST + Storage), using plain fetch.
// The local IndexedDB copy stays the source the app reads from; this module
// pushes local changes and pulls changes made on other devices.
// Conflicts: last write wins per record; pocket collisions are fixed by the store.

import type { Binder, BinderCard } from "../model/types.ts";
import * as db from "../data/db.ts";
import { coverBlob, saveCover } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import { trimUrl, type Settings } from "../data/settings.ts";

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds
  user: { id: string; email?: string };
}

interface BinderRow {
  id: string;
  name: string;
  kind: string;
  cover_color: string;
  show_name?: boolean;
  cover_image: string | null;
  sort: number;
  updated_at: string;
  deleted: boolean;
}

interface CardRow {
  id: string;
  binder_id: string;
  slot: number;
  card: BinderCard["card"];
  printing: BinderCard["printing"];
  artwork_id: string | null;
  condition: string;
  language: string;
  edition: string;
  notes: string;
  updated_at: string;
  deleted: boolean;
}

export type SyncStatus =
  | { state: "disabled" }
  | { state: "signed-out" }
  | { state: "offline" }
  | { state: "syncing" }
  | { state: "synced"; at: number }
  | { state: "error"; message: string };

const SESSION_KEY = "binder.session";
const LOCAL_COVER = "local-";

export class Sync extends EventTarget {
  status: SyncStatus = { state: "disabled" };
  private session: Session | null = null;
  private timer = 0;
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    private store: Store,
    private settings: Settings
  ) {
    super();
    try {
      this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      this.session = null;
    }
    store.addEventListener("change", () => this.schedule());
    window.addEventListener("online", () => this.schedule(500));
    window.addEventListener("offline", () => this.setStatus({ state: "offline" }));
    this.refreshStatus();
  }

  get configured() {
    return Boolean(this.settings.supabaseUrl && this.settings.supabaseKey);
  }

  get email() {
    return this.session?.user.email ?? null;
  }

  configure(settings: Settings) {
    this.settings = settings;
    this.refreshStatus();
    this.schedule(200);
  }

  private refreshStatus() {
    if (!this.configured) this.setStatus({ state: "disabled" });
    else if (!this.session) this.setStatus({ state: "signed-out" });
    else if (!navigator.onLine) this.setStatus({ state: "offline" });
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.dispatchEvent(new CustomEvent("status", { detail: status }));
  }

  private get base() {
    return trimUrl(this.settings.supabaseUrl);
  }

  private headers(json = true): Record<string, string> {
    const headers: Record<string, string> = { apikey: this.settings.supabaseKey };
    if (this.session) headers.Authorization = `Bearer ${this.session.access_token}`;
    if (json) headers["Content-Type"] = "application/json";
    return headers;
  }

  private saveSession(session: Session | null) {
    this.session = session;
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  private async auth(path: string, body: unknown): Promise<Session | null> {
    const response = await fetch(`${this.base}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: this.settings.supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || data.error_description || data.message || "Sign-in failed");
    if (!data.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      user: data.user,
    };
  }

  async signIn(email: string, password: string) {
    this.saveSession(await this.auth("token?grant_type=password", { email, password }));
    await this.firstSync();
  }

  /** Returns false when the project asks to confirm the e-mail first. */
  async signUp(email: string, password: string): Promise<boolean> {
    const session = await this.auth("signup", { email, password });
    if (!session) return false;
    this.saveSession(session);
    await this.firstSync();
    return true;
  }

  async signOut() {
    if (this.session) {
      await fetch(`${this.base}/auth/v1/logout`, { method: "POST", headers: this.headers() }).catch(() => undefined);
    }
    this.saveSession(null);
    await db.put("meta", [0], ["lastPull"]);
    this.setStatus({ state: "signed-out" });
  }

  /** On first sign-in on a device, local binders are pushed and the account's binders pulled. */
  private async firstSync() {
    // Local default binders created before signing in would duplicate the account's ones.
    // If the account already has binders, keep only local binders that hold cards.
    await db.put("meta", [0], ["lastPull"]);
    const remote = await this.request<BinderRow[]>("binders?select=id&deleted=eq.false&limit=1");
    if (remote.length) {
      for (const binder of this.store.liveBinders()) {
        if (!this.store.cardsOf(binder.id).length && binder.dirty) {
          this.store.binders.delete(binder.id);
          await db.remove("binders", binder.id);
        }
      }
    }
    await this.syncNow();
  }

  private async ensureToken() {
    if (!this.session) throw new Error("Not signed in");
    if (this.session.expires_at - 60 > Date.now() / 1000) return;
    const session = await this.auth("token?grant_type=refresh_token", { refresh_token: this.session.refresh_token });
    this.saveSession(session);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    await this.ensureToken();
    const response = await fetch(`${this.base}/rest/v1/${path}`, { ...init, headers: { ...this.headers(), ...(init.headers as Record<string, string>) } });
    if (response.status === 401) {
      this.saveSession(null);
      this.setStatus({ state: "signed-out" });
      throw new Error("Session expired, sign in again");
    }
    if (!response.ok) throw new Error(`Sync failed (${response.status}): ${(await response.text()).slice(0, 160)}`);
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  schedule(delay = 2500) {
    if (!this.configured || !this.session) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.syncNow().catch(() => undefined), delay);
  }

  async syncNow(): Promise<void> {
    if (!this.configured || !this.session) return;
    if (!navigator.onLine) return this.setStatus({ state: "offline" });
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      this.setStatus({ state: "syncing" });
      try {
        do {
          this.again = false;
          await this.pushCovers();
          await this.push();
          await this.pull();
        } while (this.again);
        this.setStatus({ state: "synced", at: Date.now() });
      } catch (error) {
        this.setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
        throw error;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async pushCovers() {
    const userId = this.session!.user.id;
    for (const binder of this.store.binders.values()) {
      if (!binder.coverImage?.startsWith(LOCAL_COVER)) continue;
      const blob = await coverBlob(binder.id);
      if (!blob) continue;
      await this.ensureToken();
      const path = `${userId}/${binder.id}-${Date.now()}`;
      const response = await fetch(`${this.base}/storage/v1/object/covers/${path}`, {
        method: "POST",
        headers: { ...this.headers(false), "Content-Type": blob.type || "image/jpeg", "x-upsert": "true" },
        body: blob,
      });
      if (!response.ok) throw new Error(`Cover upload failed (${response.status})`);
      binder.coverImage = path;
      binder.dirty = true;
      binder.updatedAt = Date.now();
      await db.put("binders", [binder]);
    }
  }

  private async push() {
    const binders = [...this.store.binders.values()].filter((binder) => binder.dirty);
    const cards = [...this.store.cards.values()].filter((card) => card.dirty);
    if (binders.length) {
      const send = (rows: Partial<BinderRow>[]) =>
        this.request("binders?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(rows),
        });
      try {
        await send(binders.map(toBinderRow));
      } catch (error) {
        // Projects created before the "show name" option lack that column: sync without it.
        if (!String(error).includes("show_name")) throw error;
        await send(binders.map(toBinderRow).map(({ show_name: _hidden, ...row }) => row));
      }
    }
    for (let index = 0; index < cards.length; index += 200) {
      await this.request("binder_cards?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(cards.slice(index, index + 200).map(toCardRow)),
      });
    }
    const pushedBinders = new Map(binders.map((binder) => [binder.id, binder.updatedAt]));
    const pushedCards = new Map(cards.map((card) => [card.id, card.updatedAt]));
    // Only clear records that were not edited while the request was in flight.
    const cleanBinders = binders.filter((binder) => binder.updatedAt === pushedBinders.get(binder.id));
    const cleanCards = cards.filter((card) => card.updatedAt === pushedCards.get(card.id));
    cleanBinders.forEach((binder) => (binder.dirty = false));
    cleanCards.forEach((card) => (card.dirty = false));
    await db.put("binders", cleanBinders);
    await db.put("cards", cleanCards);
  }

  private async pull() {
    const since = (await db.get<number>("meta", "lastPull")) ?? 0;
    const stamp = new Date(since).toISOString();
    const binderRows = await this.request<(BinderRow & { server_updated_at: string })[]>(
      `binders?select=*&server_updated_at=gt.${encodeURIComponent(stamp)}&order=server_updated_at`
    );
    const cardRows: (CardRow & { server_updated_at: string })[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await this.request<(CardRow & { server_updated_at: string })[]>(
        `binder_cards?select=*&server_updated_at=gt.${encodeURIComponent(stamp)}&order=server_updated_at&limit=1000&offset=${offset}`
      );
      cardRows.push(...page);
      if (page.length < 1000) break;
    }
    const binders: Binder[] = [];
    for (const row of binderRows) {
      const remote = fromBinderRow(row);
      const local = this.store.binders.get(row.id);
      if (local && local.dirty && local.updatedAt > remote.updatedAt) continue;
      if (remote.coverImage && remote.coverImage !== local?.coverImage) await this.downloadCover(remote);
      binders.push(remote);
    }
    const cards = cardRows
      .map(fromCardRow)
      .filter((remote) => {
        const local = this.store.cards.get(remote.id);
        return !(local && local.dirty && local.updatedAt > remote.updatedAt);
      });
    if (binders.length || cards.length) await this.store.applyRemote(binders, cards);
    // Server timestamps can trail the client clock slightly; overlap the window by a minute.
    const newest = Math.max(
      since,
      ...binderRows.map((row) => Date.parse(row.server_updated_at)),
      ...cardRows.map((row) => Date.parse(row.server_updated_at))
    );
    const next = binderRows.length || cardRows.length ? Math.max(since, newest - 60_000) : since;
    await db.put("meta", [next], ["lastPull"]);
  }

  private async downloadCover(binder: Binder) {
    try {
      await this.ensureToken();
      const response = await fetch(`${this.base}/storage/v1/object/authenticated/covers/${binder.coverImage}`, {
        headers: this.headers(false),
      });
      if (response.ok) await saveCover(binder.id, await response.blob());
    } catch {
      /* keep the colour until the next sync */
    }
  }
}

export const markLocalCover = () => `${LOCAL_COVER}${Date.now()}`;

const iso = (time: number) => new Date(time).toISOString();

function toBinderRow(binder: Binder): BinderRow {
  return {
    id: binder.id,
    name: binder.name,
    kind: binder.kind,
    cover_color: binder.coverColor,
    show_name: binder.showName !== false,
    cover_image: binder.coverImage?.startsWith(LOCAL_COVER) ? null : binder.coverImage,
    sort: binder.sort,
    updated_at: iso(binder.updatedAt),
    deleted: binder.deleted,
  };
}

function fromBinderRow(row: BinderRow): Binder {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as Binder["kind"],
    coverColor: row.cover_color,
    showName: row.show_name !== false,
    coverImage: row.cover_image,
    sort: row.sort,
    updatedAt: Date.parse(row.updated_at),
    deleted: row.deleted,
    dirty: false,
  };
}

function toCardRow(card: BinderCard): CardRow {
  return {
    id: card.id,
    binder_id: card.binderId,
    slot: card.slot,
    card: card.card,
    printing: card.printing,
    artwork_id: card.artworkId ?? null,
    condition: card.condition,
    language: card.language,
    edition: card.edition,
    notes: card.notes,
    updated_at: iso(card.updatedAt),
    deleted: card.deleted,
  };
}

function fromCardRow(row: CardRow): BinderCard {
  return {
    id: row.id,
    binderId: row.binder_id,
    slot: row.slot,
    card: row.card,
    printing: row.printing,
    artworkId: row.artwork_id,
    condition: row.condition as BinderCard["condition"],
    language: row.language,
    edition: row.edition as BinderCard["edition"],
    notes: row.notes,
    updatedAt: Date.parse(row.updated_at),
    deleted: row.deleted,
    dirty: false,
  };
}
