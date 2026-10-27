// Small user settings kept in localStorage. All of them can be changed from
// the Settings dialog, so one web build serves every setup.

export interface Settings {
  /** Cardmática base URL, e.g. http://192.168.1.20:8000. Empty = built-in demo catalog. */
  catalogUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
}

const KEY = "binder.settings";

const defaults: Settings = { catalogUrl: "", supabaseUrl: "", supabaseKey: "" };

export function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage disabled: settings stay for this session only */
  }
}

export const trimUrl = (url: string) => url.trim().replace(/\/+$/, "");
