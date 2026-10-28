// Binder editor: name and cover (hex colour or picture).

import { BINDER_COLORS, coverBottom, coverCss, coverTop, isSplitColor, joinColors } from "../model/classify.ts";
import { coverImage, deleteCover, saveCover } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import type { Binder } from "../model/types.ts";
import { markLocalCover } from "../sync/sync.ts";
import { dialogShell, field, h, icon, openDialog, toast } from "./dom.ts";
import { binderName, t } from "../i18n.ts";

export function openBinderEditor(store: Store, binder: Binder, onSaved?: () => void) {
  const shownName = binderName(binder);
  const name = h("input", { type: "text", value: shownName, maxlength: 40 });
  const showName = h("input", { type: "checkbox", checked: binder.showName !== false });
  let top = coverTop(binder.coverColor);
  let bottom = coverBottom(binder.coverColor);
  const split = h("input", { type: "checkbox", checked: isSplitColor(binder.coverColor) });
  const makePair = (value: string, label: string) => ({
    picker: h("input", { type: "color", value, "aria-label": label }),
    hex: h("input", { type: "text", value, maxlength: 7, pattern: "#[0-9a-fA-F]{6}", spellcheck: false, class: "hex" }),
  });
  const upper = makePair(top, t("Cover colour"));
  const lower = makePair(bottom, t("Bottom colour"));
  let active: "top" | "bottom" = "top";
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
  const preview = h("div", { class: "cover-preview", style: `--cover:${top};--cover-bg:${coverCss(binder.coverColor)}` });
  const currentColor = () => (split.checked ? joinColors(top, bottom) : top);
  let picture: Blob | null | undefined; // undefined = unchanged, null = removed
  const removePicture = h("button", { class: "button ghost", type: "button" }, icon("trash", t("Remove picture")));
  removePicture.hidden = !binder.coverImage;

  const showPicture = async (blob: Blob | null) => {
    preview.replaceChildren();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    preview.append(h("img", { src: url, alt: "", onload: () => URL.revokeObjectURL(url) }));
  };
  if (binder.coverImage) coverImage(binder.id).then((bitmap) => {
    if (!bitmap) return;
    const canvas = h("canvas", { width: bitmap.width, height: bitmap.height });
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    preview.replaceChildren(canvas);
  });

  const showColor = () => {
    preview.style.setProperty("--cover", top);
    preview.style.setProperty("--cover-bg", coverCss(currentColor()));
  };
  const setColor = (value: string, which = active) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    const pair = which === "top" ? upper : lower;
    pair.picker.value = value.toLowerCase();
    pair.hex.value = value.toLowerCase();
    if (which === "top") top = value.toLowerCase();
    else bottom = value.toLowerCase();
    showColor();
  };
  for (const [which, pair] of [["top", upper], ["bottom", lower]] as const) {
    pair.picker.addEventListener("input", () => setColor(pair.picker.value, which));
    pair.hex.addEventListener("input", () => setColor(pair.hex.value.startsWith("#") ? pair.hex.value : `#${pair.hex.value}`, which));
    for (const control of [pair.picker, pair.hex]) control.addEventListener("focus", () => (active = which));
  }
  const lowerRow = field(t("Bottom colour"), h("div", { class: "color-row" }, lower.picker, lower.hex));
  lowerRow.hidden = !split.checked;
  split.addEventListener("change", () => {
    lowerRow.hidden = !split.checked;
    if (!split.checked) active = "top";
    showColor();
  });
  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    picture = await shrink(chosen);
    removePicture.hidden = false;
    showPicture(picture);
  });
  removePicture.addEventListener("click", () => {
    picture = null;
    removePicture.hidden = true;
    file.value = "";
    showPicture(null);
  });

  const remove = h("button", { class: "button danger", type: "button" }, icon("trash", t("Delete binder")));
  remove.disabled = store.liveBinders().length <= 1;
  remove.title = remove.disabled ? t("At least one binder must remain.") : "";
  remove.addEventListener("click", async () => {
    const count = store.cardsOf(binder.id).length;
    if (!confirm(t("Delete the binder \"{name}\" and its {n} cards?", { name: shownName, n: count }))) return;
    await store.deleteBinder(binder.id);
    dialog.close();
    onSaved?.();
  });
  const save = h("button", { class: "button primary", type: "button", text: t("Save") });
  const dialog = dialogShell(
    t("Edit binder"),
    h(
      "div",
      { class: "editor" },
      preview,
      h(
        "div",
        { class: "editor-fields" },
        field(t("Name"), name),
        h("label", { class: "check" }, showName, h("span", { text: t("Show the name on the cover") })),
        field(t("Cover colour"), h("div", { class: "color-row" }, upper.picker, upper.hex)),
        h("label", { class: "check" }, split, h("span", { text: t("Two colours: top and bottom halves") })),
        lowerRow,
        h(
          "div",
          { class: "swatches", role: "group", "aria-label": t("Binder colours") },
          ...Object.entries(BINDER_COLORS).map(([label, value]) =>
            h("button", { type: "button", class: "swatch-button", title: t(label), "aria-label": t(label), style: `--swatch:${value}`, onclick: () => setColor(value, split.checked ? active : "top") })
          )
        ),
        field(t("Cover picture"), file, t("JPG, PNG, WebP or GIF. It covers the whole front.")),
        removePicture
      )
    ),
    h("div", { class: "dialog-actions" }, remove, save)
  );
  save.addEventListener("click", async () => {
    const patch: Partial<Pick<Binder, "name" | "coverColor" | "coverImage" | "showName">> = {
      // A translated default name left as it is keeps the stored (English) name.
      name: name.value.trim() === shownName ? binder.name : name.value.trim() || binder.name,
      showName: showName.checked,
      coverColor: currentColor(),
    };
    try {
      if (picture) {
        await saveCover(binder.id, picture);
        patch.coverImage = markLocalCover();
      } else if (picture === null) {
        await deleteCover(binder.id);
        patch.coverImage = null;
      }
      await store.updateBinder(binder.id, patch);
      dialog.close();
      onSaved?.();
    } catch (error) {
      toast(t("Could not save the cover: {error}", { error: (error as Error).message }));
    }
  });
  openDialog(dialog);
}

/** Scales big photos down to at most 1024 px so covers stay light to store and sync. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.86));
  } catch {
    return file;
  }
}
