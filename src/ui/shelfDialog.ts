// Binder shelf: pick a binder, and edit its name and cover (hex colour or picture).

import { coverImage, deleteCover, saveCover } from "../data/images.ts";
import type { Store } from "../data/store.ts";
import type { Binder } from "../model/types.ts";
import { markLocalCover } from "../sync/sync.ts";
import { dialogShell, field, h, icon, openDialog, toast } from "./dom.ts";

export function openShelf(store: Store, currentId: string, onPick: (binder: Binder) => void) {
  const list = h("ul", { class: "shelf" });
  const dialog = dialogShell("Binders", list);
  const render = () => {
    list.replaceChildren(
      ...store.liveBinders().map((binder) => {
        const count = store.cardsOf(binder.id).length;
        const spine = h("span", { class: "shelf-cover", style: `--cover:${binder.coverColor}` });
        if (binder.coverImage)
          coverImage(binder.id).then((bitmap) => {
            if (!bitmap) return;
            const canvas = h("canvas", { width: 80, height: 100 });
            const context = canvas.getContext("2d")!;
            const scale = Math.max(80 / bitmap.width, 100 / bitmap.height);
            context.drawImage(bitmap, (80 - bitmap.width * scale) / 2, (100 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
            spine.append(canvas);
          });
        return h(
          "li",
          { class: binder.id === currentId ? "current" : "" },
          h(
            "button",
            {
              class: "shelf-pick",
              onclick: () => {
                dialog.close();
                onPick(binder);
              },
            },
            spine,
            h("span", { class: "shelf-name", text: binder.name }),
            h("span", { class: "shelf-count", text: `${count} card${count === 1 ? "" : "s"}` })
          ),
          h(
            "button",
            { class: "icon-button", "aria-label": `Edit ${binder.name}`, onclick: () => openBinderEditor(store, binder, render) },
            icon("edit")
          )
        );
      })
    );
  };
  render();
  openDialog(dialog);
}

export function openBinderEditor(store: Store, binder: Binder, onSaved?: () => void) {
  const name = h("input", { type: "text", value: binder.name, maxlength: 40 });
  const picker = h("input", { type: "color", value: binder.coverColor, "aria-label": "Cover colour" });
  const hex = h("input", { type: "text", value: binder.coverColor, maxlength: 7, pattern: "#[0-9a-fA-F]{6}", spellcheck: false, class: "hex" });
  const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
  const preview = h("div", { class: "cover-preview", style: `--cover:${binder.coverColor}` });
  let picture: Blob | null | undefined; // undefined = unchanged, null = removed
  const removePicture = h("button", { class: "button ghost", type: "button" }, icon("trash", "Remove picture"));
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

  const save = h("button", { class: "button primary", type: "button", text: "Save" });
  const dialog = dialogShell(
    "Edit binder",
    h(
      "div",
      { class: "editor" },
      preview,
      h(
        "div",
        { class: "editor-fields" },
        field("Name", name),
        field("Cover colour", h("div", { class: "color-row" }, picker, hex)),
        field("Cover picture", file, "JPG, PNG, WebP or GIF. It covers the whole front."),
        removePicture
      )
    ),
    h("div", { class: "dialog-actions" }, save)
  );
  save.addEventListener("click", async () => {
    const patch: Partial<Pick<Binder, "name" | "coverColor" | "coverImage">> = {
      name: name.value.trim() || binder.name,
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
      toast(`Could not save the cover: ${(error as Error).message}`);
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
