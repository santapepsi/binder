// Binder editor: name and cover (hex colour or picture).

import { BINDER_COLORS } from "../model/classify.ts";
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
  const picker = h("input", { type: "color", value: binder.coverColor, "aria-label": t("Cover colour") });
  const hex = h("input", { type: "text", value: binder.coverColor, maxlength: 7, pattern: "#[0-9a-fA-F]{6}", spellcheck: false, class: "hex" });
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
  const preview = h("div", { class: "cover-preview", style: `--cover:${binder.coverColor}` });
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

  const setColor = (value: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    picker.value = value.toLowerCase();
    hex.value = value.toLowerCase();
    preview.style.setProperty("--cover", value);
  };
  picker.addEventListener("input", () => setColor(picker.value));
  hex.addEventListener("input", () => setColor(hex.value.startsWith("#") ? hex.value : `#${hex.value}`));
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
        field(t("Cover colour"), h("div", { class: "color-row" }, picker, hex)),
        h(
          "div",
          { class: "swatches", role: "group", "aria-label": t("Binder colours") },
          ...Object.entries(BINDER_COLORS).map(([label, value]) =>
            h("button", { type: "button", class: "swatch-button", title: t(label), "aria-label": t(label), style: `--swatch:${value}`, onclick: () => setColor(value) })
          )
        ),
        field(t("Cover picture"), file, t("JPG, PNG, WebP or GIF. It covers the whole front.")),
        removePicture
      )
    ),
    h("div", { class: "dialog-actions" }, save)
  );
  save.addEventListener("click", async () => {
    const patch: Partial<Pick<Binder, "name" | "coverColor" | "coverImage" | "showName">> = {
      // A translated default name left as it is keeps the stored (English) name.
      name: name.value.trim() === shownName ? binder.name : name.value.trim() || binder.name,
      showName: showName.checked,
      coverColor: /^#[0-9a-f]{6}$/i.test(hex.value) ? hex.value.toLowerCase() : binder.coverColor,
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
