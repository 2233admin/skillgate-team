import path from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve skillgate npm package root (directory containing package.json + bin/). */
export function cliPackageRoot(fromUrl = import.meta.url): string {
  const here = path.dirname(fileURLToPath(fromUrl));
  if (path.basename(here) === "dist") {
    return path.dirname(here);
  }
  if (path.basename(here) === "commands") {
    return path.resolve(here, "..", "..");
  }
  return path.resolve(here, "..", "..");
}

export function cliEntryPath(fromUrl = import.meta.url): string {
  return path.join(cliPackageRoot(fromUrl), "bin", "skillgate.mjs");
}