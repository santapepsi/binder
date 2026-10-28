// Form for the details of an owned copy: printing (set + rarity), condition,
// language, edition and notes. Used when adding a card and in the detail panel.

import type { Catalog, CatalogPrinting } from "../data/catalog.ts";
import type { NewCopy } from "../data/store.ts";
import { artworksOf } from "../model/artworks.ts";
import { CONDITIONS, EDITIONS, LANGUAGES, type CardSnapshot, type PrintingRef } from "../model/types.ts";
import { field, h, select } from "./dom.ts";
import { t } from "../i18n.ts";

const LANGUAGE_BY_CODE: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  es: "Spanish",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ae: "Asian-English",
};

const printingLabel = (printing: PrintingRef) => `${printing.code} · ${printing.rarity} — ${printing.setName}`;

export function copyFields(
  catalog: Catalog,
  card: CardSnapshot,
  value: NewCopy,
  onChange: (patch: Partial<NewCopy>) => void
): HTMLElement {
  const languageSelect = select(LANGUAGES, value.language, (language) => onChange({ language }), t);
  const printingSlot = h("div", { class: "printing-slot" });

  const manual = () => {
    // Offline or not in the catalog: set code and rarity typed by hand.
    const code = h("input", { type: "text", placeholder: t("Set code, e.g. LOB-EN001"), value: value.printing?.code ?? "" });
    const rarity = h("input", { type: "text", placeholder: t("Rarity, e.g. Ultra Rare"), value: value.printing?.rarity ?? "" });
    const update = () => {
      const printing = code.value.trim() || rarity.value.trim()
        ? { id: null, code: code.value.trim().toUpperCase(), setName: value.printing?.setName ?? "", rarity: rarity.value.trim() }
        : null;
      value.printing = printing;
      onChange({ printing });
    };
    code.addEventListener("change", update);
    rarity.addEventListener("change", update);
    printingSlot.replaceChildren(h("div", { class: "field-row" }, field(t("Set code"), code), field(t("Rarity"), rarity)));
  };

  const fromCatalog = (printings: CatalogPrinting[]) => {
    const options = [...printings];
    const current = value.printing;
    if (current && !options.some((printing) => samePrinting(printing, current)))
      options.unshift({ ...current, language: "", market: "" });
    const element = h("select", {});
    element.append(h("option", { value: "", text: t("— Not specified —") }));
    options.forEach((printing, index) =>
      element.append(h("option", { value: String(index), text: printingLabel(printing), selected: !!current && samePrinting(printing, current) }))
    );
    element.addEventListener("change", () => {
      const chosen = element.value === "" ? null : options[Number(element.value)];
      const printing = chosen ? { id: chosen.id, code: chosen.code, setName: chosen.setName, rarity: chosen.rarity } : null;
      value.printing = printing;
      const patch: Partial<NewCopy> = { printing };
      const language = chosen?.language ? LANGUAGE_BY_CODE[chosen.language] : undefined;
      if (language && language !== value.language) {
        patch.language = language;
        value.language = language;
        languageSelect.value = language;
      }
      onChange(patch);
    });
    const typeIn = h("button", { type: "button", class: "link-button", text: t("Type it in instead"), onclick: manual });
    printingSlot.replaceChildren(field(t("Set & rarity"), element), typeIn);
  };

  printingSlot.append(h("p", { class: "muted", text: t("Loading printings…") }));
  catalog
    .printings(card.catalogId, false)
    .then((printings) => (printings.length ? fromCatalog(printings) : manual()))
    .catch(manual);

  // Alternate artworks: listed by number, the image shows once the card is in the binder.
  const artworks = artworksOf(card);
  let artworkField: HTMLElement | null = null;
  if (artworks.length > 1) {
    const options = artworks.map((_, index) => (index === 0 ? t("Artwork 1 (main)") : t("Artwork {n}", { n: index + 1 })));
    const current = Math.max(0, artworks.findIndex((art) => art.id === value.artworkId));
    artworkField = field(
      t("Artwork"),
      select(options, options[current], (label) => {
        const artworkId = artworks[options.indexOf(label)].id;
        value.artworkId = artworkId;
        onChange({ artworkId });
      }),
      t("This card has {n} artworks.", { n: artworks.length })
    );
  }

  const notes = h("textarea", { rows: 2, placeholder: t("Notes"), value: value.notes });
  notes.addEventListener("change", () => onChange({ notes: notes.value }));

  return h(
    "div",
    { class: "copy-fields" },
    printingSlot,
    artworkField,
    h(
      "div",
      { class: "field-row" },
      field(t("Condition"), select(CONDITIONS, value.condition, (condition) => onChange({ condition: condition as NewCopy["condition"] }), t)),
      field(t("Edition"), select(EDITIONS, value.edition, (edition) => onChange({ edition: edition as NewCopy["edition"] }), t))
    ),
    field(t("Language"), languageSelect),
    field(t("Notes"), notes)
  );
}

function samePrinting(a: PrintingRef, b: PrintingRef) {
  return (a.id && a.id === b.id) || (a.code === b.code && a.rarity === b.rarity);
}
