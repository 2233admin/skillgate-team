// Regression: ISSUE-001 — Tauri updater configuration must deserialize at startup.
// Found by /qa on 2026-07-15
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-07-15.md

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

const configPath = fileURLToPath(new URL("../desktop-tauri/src-tauri/tauri.conf.json", import.meta.url))

test("base Tauri config provides the updater shape required before release overlay", () => {
  const config = JSON.parse(readFileSync(configPath, "utf8"))

  assert.equal(typeof config.plugins?.updater, "object")
  assert.notEqual(config.plugins.updater, null)
  assert.equal(typeof config.plugins.updater.pubkey, "string")
})
