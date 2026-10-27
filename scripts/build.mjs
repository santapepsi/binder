// Build with esbuild: one small hashed bundle, static files from public/,
// and a service worker that precaches everything so the web app works offline.
import * as esbuild from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const serve = process.argv.includes("--serve");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/assets`, { recursive: true });
await cp("public", outdir, { recursive: true });

const options = {
  entryPoints: { app: "src/main.ts" },
  bundle: true,
  splitting: true,
  format: "esm",
  target: ["es2022", "chrome100", "safari16"],
  outdir: `${outdir}/assets`,
  entryNames: serve ? "[name]" : "[name]-[hash]",
  assetNames: "[name]-[hash]",
  loader: { ".woff": "file" },
  minify: !serve,
  sourcemap: serve,
  metafile: true,
  legalComments: "none",
  define: { __DEV__: String(serve) },
};

async function writeShell(metafile) {
  const outputs = Object.keys(metafile.outputs).map((path) => path.replace(`${outdir}/`, ""));
  const js = outputs.find((path) => path.endsWith(".js") && path.includes("app"));
  const css = outputs.find((path) => path.endsWith(".css"));
  const template = await readFile("index.html", "utf8");
  const html = template
    .replace("<!--CSS-->", css ? `<link rel="stylesheet" href="./${css}">` : "")
    .replace("<!--JS-->", `<script type="module" src="./${js}"></script>`);
  await writeFile(`${outdir}/index.html`, html);
  const files = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", ...outputs.map((path) => `./${path}`)];
  const version = createHash("sha1").update(files.join("|")).digest("hex").slice(0, 10);
  const worker = (await readFile("src/sw.js", "utf8"))
    .replace("__VERSION__", version)
    .replace("__FILES__", JSON.stringify(files));
  await writeFile(`${outdir}/sw.js`, worker);
}

if (serve) {
  const context = await esbuild.context({
    ...options,
    plugins: [
      {
        name: "shell",
        setup(build) {
          build.onEnd((result) => result.metafile && writeShell(result.metafile));
        },
      },
    ],
  });
  await context.watch();
  const { port } = await context.serve({ servedir: outdir, port: 5173, host: "0.0.0.0" });
  console.log(`Binder dev server on http://localhost:${port}`);
} else {
  const result = await esbuild.build(options);
  await writeShell(result.metafile);
  const sizes = Object.entries(result.metafile.outputs).map(
    ([path, { bytes }]) => `${path}  ${(bytes / 1024).toFixed(1)} kB`
  );
  console.log(sizes.join("\n"));
}
