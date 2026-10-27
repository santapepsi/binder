import "./styles.css";
import { startApp } from "./ui/app.ts";

declare const __DEV__: boolean;

const root = document.getElementById("app")!;

function fail(message: string) {
  root.innerHTML = "";
  const box = document.createElement("div");
  box.className = "fatal panel";
  box.textContent = message;
  root.append(box);
}

const gl = document.createElement("canvas").getContext("webgl2");
if (!gl) fail("This device or browser does not support WebGL 2, which the 3D binder needs.");
else if (!("indexedDB" in window)) fail("This browser does not allow local storage (IndexedDB), which the binder needs.");
else
  startApp(root)
    .then((app) => {
      if (__DEV__ || new URLSearchParams(location.search).has("debug")) Object.assign(window, { binderApp: app });
    })
    .catch((error) => fail(`The binder could not start: ${error instanceof Error ? error.message : error}`));

if ("serviceWorker" in navigator && !__DEV__ && location.protocol === "https:" && !location.hostname.endsWith("localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
