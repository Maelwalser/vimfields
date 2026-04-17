import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const extensionBuild = {
  entryPoints: [
    "src/content.ts",
    "src/background.ts",
    "popup/popup.ts",
  ],
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  minify: !isWatch,
  logLevel: "info",
};

// Separate bundle for the Vivaldi UI mod. Must be IIFE (plain <script>) and
// must NOT be ESM — Vivaldi loads custom.js synchronously from browser.html.
const vivaldiBuild = {
  entryPoints: ["src/vivaldi-mod.ts"],
  bundle: true,
  outfile: "dist/vivaldi/custom.js",
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  minify: !isWatch,
  logLevel: "info",
};

if (isWatch) {
  const extCtx = await esbuild.context(extensionBuild);
  const vivCtx = await esbuild.context(vivaldiBuild);
  await Promise.all([extCtx.watch(), vivCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionBuild),
    esbuild.build(vivaldiBuild),
  ]);
}
