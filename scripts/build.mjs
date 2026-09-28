import * as esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { extensionRuntimeFiles, extensionScripts } from "./extensionFiles.mjs";

const shared = {
  bundle: true,
  target: ["chrome120"],
  platform: "browser",
  legalComments: "none",
};

await esbuild.build({
  ...shared,
  entryPoints: ["src/background.ts"],
  format: "esm",
  outfile: "dist/background.js",
});

await esbuild.build({
  ...shared,
  entryPoints: ["src/content.ts", "src/popup.ts", "src/options.ts"],
  format: "iife",
  outdir: "dist",
});

const stage = path.resolve("build/extension");
await rm(stage, { recursive: true, force: true });
await mkdir(path.join(stage, "dist"), { recursive: true });

for (const file of extensionRuntimeFiles) {
  const destination = path.join(stage, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(file, destination);
}

for (const file of extensionScripts) {
  await cp(path.join("dist", file), path.join(stage, "dist", file));
}

console.log("Built dist/ and build/extension/");
