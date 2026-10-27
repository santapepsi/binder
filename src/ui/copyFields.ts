// Form for the details of an owned copy: printing (set + rarity), condition,
// language, edition and notes. Used when adding a card and in the detail panel.

import type { Catalog, CatalogPrinting } from "../data/catalog.ts";
import type { NewCopy } from "../data/store.ts";
import { CONDITIONS, EDITIONS, LANGUAGES, type CardSnapshot, type PrintingRef } from "../model/types.ts";
import { field, h, select } from "./dom.ts";

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
  const languageSelect = select(LANGUAGES, value.language, (language) => onChange({ language }));
  const printingSlot = h("div", { class: "printing-slot" });

  const manual = () => {
    // Offline or not in the catalog: set code and rarity typed by hand.
    const code = h("input", { type: "text", placeholder: "Set code, e.g. LOB-EN001", value: value.printing?.code ?? "" });
    const rarity = h("input", { type: "text", placeholder: "Rarity, e.g. Ultra Rare", value: value.printing?.rarity ?? "" });
    const update = () => {
      const printing = code.value.trim() || rarity.value.trim()
        ? { id: null, code: code.value.trim().toUpperCase(), setName: value.printing?.setName ?? "", rarity: rarity.value.trim() }
        : null;
      value.printing = printing;
      onChange({ printing });
    };
    code.addEventListener("change", update);
    rarity.addEventListener("change", update);
    printingSlot.replaceChildren(h("div", { class: "field-row" }, field("Set code", code), field("Rarity", rarity)));
  };

  const fromCatalog = (printings: CatalogPrinting[]) => {
    const options = [...printings];
    const current = value.printing;
    if (current && !options.some((printing) => samePrinting(printing, current)))
      options.unshift({ ...current, language: "", market: "" });
    const element = h("select", {});
    element.append(h("option", { value: "", text: "— Not specified —" }));
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
    const typeIn = h("button", { type: "button", class: "link-button", text: "Type it in instead", onclick: manual });
    printingSlot.replaceChildren(field("Set & rarity", element), typeIn);
  };

  printingSlot.append(h("p", { class: "muted", text: "Loading printings…" }));
  catalog
    .printings(card.catalogId)
    .then((printings) => (printings.length ? fromCatalog(printings) : manual()))
    .catch(manual);

  const notes = h("textarea", { rows: 2, placeholder: "Notes", value: value.notes });
  notes.addEventListener("change", () => onChange({ notes: notes.value }));

  return h(
    "div",
    { class: "copy-fields" },
    printingSlot,
    h(
      "div",
      { class: "field-row" },
      field("Condition", select(CONDITIONS, value.condition, (condition) => onChange({ condition: condition as NewCopy["condition"] }))),
      field("Edition", select(EDITIONS, value.edition, (edition) => onChange({ edition: edition as NewCopy["edition"] })))
    ),
    field("Language", languageSelect),
    field("Notes", notes)
  );
}

function samePrinting(a: PrintingRef, b: PrintingRef) {
  return (a.id && a.id === b.id) || (a.code === b.code && a.rarity === b.rarity);
}
