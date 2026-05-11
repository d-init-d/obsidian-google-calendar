import esbuild from "esbuild";

const isProduction = process.argv.includes("--production");

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian"],
  format: "cjs",
  outfile: "main.js",
  sourcemap: !isProduction,
  minify: isProduction,
}).catch(() => process.exit(1));