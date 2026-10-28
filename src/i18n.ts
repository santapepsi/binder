// Interface language: English (the texts in the code) or Japanese (the table below).
// The choice is kept on this device; changing it reloads the app.

export type Language = "en" | "ja";

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", ja: "日本語" };

const KEY = "binder.language";

function stored(): Language {
  try {
    const value = localStorage.getItem(KEY);
    return value === "ja" ? "ja" : "en";
  } catch {
    return "en";
  }
}

export const language: Language = stored();
if (typeof document !== "undefined") document.documentElement.lang = language;

export function setLanguage(next: Language) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage disabled: nothing to keep */
  }
  if (next !== language) location.reload();
}

/** Translates an English text; {name} placeholders are filled from vars. */
export function t(text: string, vars: Record<string, string | number> = {}): string {
  const template = (language === "ja" && JA[text]) || text;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? (typeof vars[key] === "number" ? (vars[key] as number).toLocaleString(locale()) : String(vars[key])) : match
  );
}

/** English singular/plural; Japanese has a single form (the plural key). */
export const plural = (n: number, one: string, many: string) => t(n === 1 ? one : many, { n });

export const locale = () => (language === "ja" ? "ja-JP" : undefined);

/** Names of the binders created on first launch, shown translated while the user keeps them. */
export function binderName(binder: { name: string }): string {
  return language === "ja" ? DEFAULT_BINDER_NAMES[binder.name] ?? binder.name : binder.name;
}

const DEFAULT_BINDER_NAMES: Record<string, string> = {
  "Normal Monsters": "通常モンスター",
  "Effect Monsters": "効果モンスター",
  "Ritual Monsters": "儀式モンスター",
  "Fusion Monsters": "融合モンスター",
  "Synchro Monsters": "シンクロモンスター",
  "Xyz Monsters": "エクシーズモンスター",
  "Link Monsters": "リンクモンスター",
  "Pendulum Monsters": "ペンデュラムモンスター",
  Spells: "魔法",
  Traps: "罠",
  "Personal I": "パーソナル I",
  "Personal II": "パーソナル II",
};

/** Words of a card's type line ("Spellcaster / Effect", "Quick-Play Spell"), OCG style. */
const TYPE_WORDS: Record<string, string> = {
  Monster: "モンスター",
  Spell: "魔法",
  Trap: "罠",
  Skill: "スキル",
  Normal: "通常",
  Effect: "効果",
  Ritual: "儀式",
  Fusion: "融合",
  Synchro: "シンクロ",
  Xyz: "エクシーズ",
  Link: "リンク",
  Pendulum: "ペンデュラム",
  Tuner: "チューナー",
  Token: "トークン",
  Flip: "リバース",
  Spirit: "スピリット",
  Union: "ユニオン",
  Gemini: "デュアル",
  Toon: "トゥーン",
  "Quick-Play": "速攻",
  Continuous: "永続",
  Equip: "装備",
  Field: "フィールド",
  Counter: "カウンター",
  Aqua: "水族",
  Beast: "獣族",
  "Beast-Warrior": "獣戦士族",
  "Creator-God": "創造神族",
  Cyberse: "サイバース族",
  Dinosaur: "恐竜族",
  "Divine-Beast": "幻神獣族",
  Dragon: "ドラゴン族",
  Fairy: "天使族",
  Fiend: "悪魔族",
  Fish: "魚族",
  Illusion: "幻想魔族",
  Insect: "昆虫族",
  Machine: "機械族",
  Plant: "植物族",
  Psychic: "サイキック族",
  Pyro: "炎族",
  Reptile: "爬虫類族",
  Rock: "岩石族",
  "Sea Serpent": "海竜族",
  Spellcaster: "魔法使い族",
  Thunder: "雷族",
  Warrior: "戦士族",
  "Winged Beast": "鳥獣族",
  Wyrm: "幻竜族",
  Zombie: "アンデット族",
};

/** Type line in the interface language: "[魔法使い族／効果]", "[速攻魔法]". */
export function translateTypeLine(line: string): string {
  if (language !== "ja") return line;
  const spellTrap = /^(?:(.+) )?(Spell|Trap)$/.exec(line);
  if (spellTrap) return `${spellTrap[1] ? TYPE_WORDS[spellTrap[1]] ?? spellTrap[1] : "通常"}${TYPE_WORDS[spellTrap[2]]}`;
  return line
    .split(" / ")
    .map((word) => TYPE_WORDS[word] ?? word)
    .join("／");
}

/** Stored values (condition, edition, card language) shown in the interface language. */
export const label = (value: string) => t(value);

const JA: Record<string, string> = {
  // ---- top bar, pager
  "Binders and deckboxes": "バインダーとデッキケース",
  "Sync status": "同期の状態",
  "Add card": "カードを追加",
  "Edit binder": "バインダーを編集",
  "Show or hide all rarity stickers": "すべてのレアリティシールを表示／非表示",
  "Rarity stickers shown on every card.": "すべてのカードにレアリティシールを表示しました。",
  "Rarity stickers hidden on every card.": "すべてのカードのレアリティシールを非表示にしました。",
  "Add a card spot to the table": "テーブルにカード置き場を追加",
  Settings: "設定",
  "Left page": "左ページ",
  "Right page": "右ページ",
  Pages: "ページ",
  "First page": "最初のページ",
  "Previous page": "前のページ",
  "Next page": "次のページ",
  "Last page": "最後のページ",
  "3D binder. Use the arrow keys to turn pages.": "3Dバインダー。矢印キーでページをめくります。",
  "Deck {main} · Extra {extra} · Side {side}": "デッキ {main} · EX {extra} · サイド {side}",
  "{n} card": "{n}枚",
  "{n} cards": "{n}枚",
  Cover: "表紙",
  "Inside cover": "表紙の裏",
  "End / {pages}": "終わり / {pages}",
  "{name} went to {binder}.": "{name}は「{binder}」に入りました。",
  Open: "開く",

  // ---- menu
  Binders: "バインダー",
  Deckboxes: "デッキケース",
  "Edit {name}": "{name}を編集",
  "New deck": "新しいデッキ",
  "Deck {n}": "デッキ {n}",

  // ---- deck view
  "Deck name": "デッキ名",
  "Card types owned": "所持カード種類",
  Deck: "デッキ",
  Extra: "エクストラ",
  Side: "サイド",
  "Search your cards…": "所持カードを検索…",
  "Search your cards": "所持カードを検索",
  Sort: "並べ替え",
  "Sort: type": "並び：種類",
  "Sort: name": "並び：名前",
  "Sort: ATK": "並び：攻撃力",
  "Main Deck needs {n} more": "メインデッキはあと{n}枚必要",
  "Extra Deck over 15": "エクストラデッキが15枚を超えています",
  "Monsters {m} · Spells {s} · Traps {t} — {state}": "モンスター {m} · 魔法 {s} · 罠 {t} — {state}",
  "Legal size": "枚数OK",
  "◀ Binders": "◀ バインダー",
  "+ Deck": "+ デッキ",
  "+ Side": "+ サイド",
  Remove: "外す",
  "Export .ydk": ".ydkで書き出し",
  "Delete deck": "デッキを削除",
  'Delete the deck "{name}"?': "デッキ「{name}」を削除しますか？",
  "Pick a card and press + Deck (or double-click it) to put it in the deck. Fusion, Synchro, Xyz and Link monsters go to the Extra Deck.":
    "カードを選んで「+ デッキ」を押す（またはダブルクリック）とデッキに入ります。融合・シンクロ・エクシーズ・リンクモンスターはエクストラデッキに入ります。",
  "Pick a card to see it here. Double-click it or press Remove to take it out of the deck.":
    "カードを選ぶとここに表示されます。ダブルクリックか「外す」でデッキから外します。",
  "In this deck: {n} · owned: {owned}": "このデッキ：{n} · 所持：{owned}",
  " · Extra Deck card": " · エクストラデッキのカード",
  "No card text.": "カードテキストなし。",
  "Deck not found.": "デッキが見つかりません。",
  "A deck can hold at most {n} copies of a card.": "同名カードはデッキに{n}枚までです。",
  "You own {n} copy of this card.": "このカードは{n}枚しか持っていません。",
  "You own {n} copies of this card.": "このカードは{n}枚しか持っていません。",
  "The Main Deck is full ({n}).": "メインデッキがいっぱいです（{n}枚）。",
  "The Extra Deck is full ({n}).": "エクストラデッキがいっぱいです（{n}枚）。",
  "The Side Deck is full ({n}).": "サイドデッキがいっぱいです（{n}枚）。",

  // ---- detail panel
  "Card details": "カードの詳細",
  "Level {n}": "レベル {n}",
  "Rank {n}": "ランク {n}",
  "Link {n}": "リンク {n}",
  "Scale {n}": "スケール {n}",
  "ATK {n}": "攻撃力 {n}",
  "DEF {n}": "守備力 {n}",
  "Move to binder": "バインダーへ移動",
  "Move to…": "移動先…",
  Close: "閉じる",
  "Your copy": "あなたのカード",
  "Page {page} · pocket {pocket}": "{page}ページ · ポケット{pocket}",
  "Show the rarity sticker on the pocket": "ポケットにレアリティシールを表示",
  Binder: "バインダー",
  "Remove {name} from this binder?": "{name}をこのバインダーから外しますか？",
  "{n} cards · {unique} different": "{n}枚 · {unique}種類",
  "Tap a card to see it here. Tap an empty pocket to add a card there. Drag a card (long-press on touch screens) to move it; hold it at the page edge to turn the page.":
    "カードをタップするとここに表示されます。空のポケットをタップするとそこにカードを追加できます。カードをドラッグ（タッチ画面では長押し）して移動し、ページの端で止めるとページがめくれます。",

  // ---- add card
  "Add card to this pocket": "このポケットにカードを追加",
  "Search by card name…": "カード名で検索…",
  "Search cards": "カードを検索",
  "Load more": "さらに表示",
  "Checking the card database…": "カードデータベースを確認中…",
  "Saving the card database on this device…": "カードデータベースをこの端末に保存中…",
  "Downloading the card database (first time only)… {mb} MB": "カードデータベースをダウンロード中（初回のみ）… {mb} MB",
  "Preparing the card database…": "カードデータベースを準備中…",
  "No cards found.": "カードが見つかりません。",
  "{n} cards — keep typing to narrow down": "{n}枚 — 入力を続けて絞り込んでください",
  "You are offline. The card database is downloaded the first time you add a card; connect once to get it.":
    "オフラインです。カードデータベースは最初にカードを追加するときにダウンロードされます。一度接続してください。",
  "Could not get the card database: {error}": "カードデータベースを取得できませんでした：{error}",
  "Loading card…": "カードを読み込み中…",
  "Could not load the card: {error}": "カードを読み込めませんでした：{error}",
  "Add to {name}": "「{name}」に追加",
  "Back to results": "検索結果に戻る",
  "Goes to the {name} binder.": "「{name}」バインダーに入ります。",

  // ---- copy fields
  "Set code, e.g. LOB-EN001": "セットコード（例：LOB-EN001）",
  "Rarity, e.g. Ultra Rare": "レアリティ（例：Ultra Rare）",
  "Set code": "セットコード",
  Rarity: "レアリティ",
  "— Not specified —": "— 指定なし —",
  "Type it in instead": "手入力する",
  "Set & rarity": "セットとレアリティ",
  "Loading printings…": "収録情報を読み込み中…",
  "Artwork 1 (main)": "イラスト1（メイン）",
  "Artwork {n}": "イラスト{n}",
  Artwork: "イラスト",
  "This card has {n} artworks.": "このカードには{n}種類のイラストがあります。",
  Notes: "メモ",
  Condition: "状態",
  Edition: "エディション",
  Language: "言語",
  Mint: "完美品",
  "Near Mint": "美品",
  Excellent: "良品",
  Good: "並品",
  "Light Played": "やや傷あり",
  Played: "傷あり",
  Poor: "難あり",
  "1st Edition": "1st Edition",
  Unlimited: "Unlimited",
  "Limited Edition": "Limited Edition",
  English: "英語",
  French: "フランス語",
  German: "ドイツ語",
  Italian: "イタリア語",
  Portuguese: "ポルトガル語",
  Spanish: "スペイン語",
  Japanese: "日本語",
  Korean: "韓国語",
  Chinese: "中国語",
  "Asian-English": "アジア英語版",

  // ---- binder editor
  "Cover colour": "表紙の色",
  "Remove picture": "画像を削除",
  Save: "保存",
  Name: "名前",
  "Show the name on the cover": "表紙に名前を表示",
  "Binder colours": "バインダーの色",
  black: "黒",
  white: "白",
  blue: "青",
  red: "赤",
  green: "緑",
  violet: "紫",
  pink: "ピンク",
  "Cover picture": "表紙の画像",
  "JPG, PNG, WebP or GIF. It covers the whole front.": "JPG・PNG・WebP・GIF。表紙全体に表示されます。",
  "Could not save the cover: {error}": "表紙を保存できませんでした：{error}",

  // ---- table
  "Card on the table": "テーブルのカード",
  "Empty spot": "空き",
  "Change card": "カードを変更",
  "Choose card": "カードを選ぶ",
  "Turn face up": "表向きにする",
  "Turn face down": "裏向きにする",
  "↺ Rotate 15°": "↺ 15°回転",
  "↻ Rotate 15°": "↻ 15°回転",
  "Turn 90°": "90°回転",
  Straighten: "まっすぐにする",
  "Take card out": "カードを取り除く",
  "Add another spot": "置き場を追加",
  "Remove spot": "置き場を削除",
  "Drag a spot to move it (long-press on touch screens).": "置き場はドラッグで移動できます（タッチ画面では長押し）。",
  "Choose a card": "カードを選ぶ",
  "Place it face down": "裏向きに置く",
  "Put on the table": "テーブルに置く",

  // ---- settings
  "Sync is not set up — binders are saved on this device.": "同期は未設定です — バインダーはこの端末に保存されます。",
  "Signed out — binders are saved on this device.": "ログアウト中 — バインダーはこの端末に保存されます。",
  "Offline — changes will sync when you reconnect.": "オフライン — 再接続すると変更が同期されます。",
  "Syncing…": "同期中…",
  "Synced at {time}.": "{time}に同期しました。",
  "Sync problem: {message}": "同期の問題：{message}",
  "{n} cards on this device, downloaded {date}.": "この端末に{n}枚（{date}にダウンロード）。",
  "Not downloaded yet. It downloads the first time you add a card.": "未ダウンロードです。最初にカードを追加するときにダウンロードされます。",
  "Check for updates": "更新を確認",
  "Downloading… {mb} MB": "ダウンロード中… {mb} MB",
  "Saving…": "保存中…",
  "Checking…": "確認中…",
  " It is up to date.": " 最新です。",
  "Could not update: {error}": "更新できませんでした：{error}",
  "Publishable (anon) key": "公開キー（anon）",
  Email: "メールアドレス",
  Password: "パスワード",
  "Working…": "処理中…",
  "Fill in your Supabase project to sign in and sync between web and Android.":
    "WebとAndroidの間で同期するには、Supabaseプロジェクトを入力してログインしてください。",
  "Signed in as {email}": "{email}でログイン中",
  "Sync now": "今すぐ同期",
  "Sign out": "ログアウト",
  "Sign in": "ログイン",
  "Create account": "アカウント作成",
  "Check your email to confirm the account, then sign in.": "メールを確認してアカウントを認証してから、ログインしてください。",
  "Card back": "カードの裏面",
  "Use the default back": "標準の裏面を使う",
  "Using your font. It is kept on this device and in your account, not published with the app.":
    "あなたのフォントを使用中。この端末とアカウントに保存され、アプリと一緒に公開されることはありません。",
  "Using the app font. Load a .ttf or .otf file to use another one.": "アプリのフォントを使用中。別のフォントを使うには.ttfか.otfファイルを読み込んでください。",
  "That file is not a font this browser can read.": "このファイルはこのブラウザで読めるフォントではありません。",
  "Use the app font": "アプリのフォントを使う",
  "Cover lettering": "表紙の文字",
  "Font file": "フォントファイル",
  "Picture for face-down cards": "裏向きカードの画像",
  "Card database": "カードデータベース",
  "Account & sync": "アカウントと同期",
  Key: "キー",
  "Interface language": "表示言語",
  "Card names and texts come from YGOPRODeck, which has them in English only.":
    "カード名とテキストはYGOPRODeckのデータで、英語のみです。",
  "Card texts and images come from YGOPRODeck. Yu-Gi-Oh! is a trademark of Konami; this app is not affiliated with Konami.":
    "カードのテキストと画像はYGOPRODeckより。遊☆戯☆王はKONAMIの商標です。このアプリはKONAMIとは関係ありません。",
  "Not syncing {parts}: run supabase/schema.sql again in your Supabase SQL editor.":
    "{parts}は同期されていません：SupabaseのSQLエディタでsupabase/schema.sqlをもう一度実行してください。",
  "hiding the name on covers": "表紙の名前の非表示",
  "cards on the table and the card back": "テーブルのカードとカードの裏面",
  " and ": "と",

  // ---- start-up
  "This device or browser does not support WebGL 2, which the 3D binder needs.": "この端末またはブラウザは、3Dバインダーに必要なWebGL 2に対応していません。",
  "This browser does not allow local storage (IndexedDB), which the binder needs.": "このブラウザでは、バインダーに必要なローカル保存（IndexedDB）が使えません。",
  "The binder could not start: {error}": "バインダーを起動できませんでした：{error}",
};
