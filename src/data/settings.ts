// Small user settings kept in localStorage. All of them can be changed from
// the Settings dialog, so one web build serves every setup.

export interface Settings {
  supabaseUrl: string;
  supabaseKey: string;
}

const KEY = "binder.settings";

const defaults: Settings = { supabaseUrl: "", supabaseKey: "" };

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
