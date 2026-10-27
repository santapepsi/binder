// Small user settings kept in localStorage. All of them can be changed from
// the Settings dialog, so one web build serves every setup.

export interface Settings {
  supabaseUrl: string;
  supabaseKey: string;
}

const KEY = "binder.settings";

/**
 * The binder's own Supabase project, built in so every install can sign in
 * without typing anything. The publishable key is meant to be public: what each
 * account can read or write is limited by row level security (supabase/schema.sql).
 */
export const DEFAULT_SUPABASE = {
  supabaseUrl: "https://eewnftkxovnwbucghqqp.supabase.co",
  supabaseKey: "sb_publishable_hUR78-6vNLa1CfarsOHErw_-Ws1C0LB",
};

const defaults: Settings = { ...DEFAULT_SUPABASE };

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Settings>;
    // Empty saved values fall back to the built-in project.
    return {
      supabaseUrl: saved.supabaseUrl || defaults.supabaseUrl,
      supabaseKey: saved.supabaseKey || defaults.supabaseKey,
    };
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
