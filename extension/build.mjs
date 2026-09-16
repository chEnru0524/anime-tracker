import { build } from "esbuild";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "extension-dist");
await mkdir(out, { recursive: true });
await build({
  entryPoints: ["worker", "content", "popup"].map((x) =>
    resolve(root, "extension", x + ".ts"),
  ),
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: false,
});
for (const name of ["manifest.json", "popup.html", "popup.css", "README.md"])
  await copyFile(resolve(root, "extension", name), resolve(out, name));
console.log("Extension ready: extension-dist");
const files = {};
for (const name of [
  "manifest.json",
  "popup.html",
  "popup.css",
  "README.md",
  "worker.js",
  "content.js",
  "popup.js",
])
  files[name] = new Uint8Array(await readFile(resolve(out, name)));
await mkdir(resolve(root, "public"), { recursive: true });
await writeFile(
  resolve(root, "public/yoru-bahamut-extension.zip"),
  zipSync(files),
);
