// Adjusts the generated Capacitor Android project (android/ is not committed):
// - allows plain-HTTP requests, since a Cardmática server on the local network is http://
// - signs debug builds with the committed key so a new APK installs over the old one
//   without losing the binders stored on the phone.
import { readFile, writeFile, copyFile } from "node:fs/promises";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
let manifest = await readFile(manifestPath, "utf8");
if (!manifest.includes("usesCleartextTraffic")) {
  manifest = manifest.replace("<application", '<application android:usesCleartextTraffic="true"');
  await writeFile(manifestPath, manifest);
}

await copyFile("android-config/debug.keystore", "android/app/binder-debug.keystore");
const gradlePath = "android/app/build.gradle";
let gradle = await readFile(gradlePath, "utf8");
if (!gradle.includes("binder-debug.keystore")) {
  gradle = gradle.replace(
    /android\s*\{/,
    `android {
    signingConfigs {
        debug {
            storeFile file("binder-debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }`
  );
  await writeFile(gradlePath, gradle);
}
console.log("Android project patched");
