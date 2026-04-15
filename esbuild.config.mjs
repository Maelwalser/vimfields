import * as esbuild from "esbuild";

const isWatch = process.argv.includes("--watch");

const buildOptions = {
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

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
}
