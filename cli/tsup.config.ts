import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/team-api/index.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "node18",
  platform: "node",
  splitting: false,
  sourcemap: true,
  dts: false,
  clean: true,
  shims: true,
  external: ["@napi-rs/keyring"],
});