#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.argv.splice(2, 0, "skillctl");
await import(pathToFileURL(path.join(here, "..", "dist", "cli.js")).href);
