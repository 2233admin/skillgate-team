import assert from "node:assert/strict"
import test from "node:test"
import { assertBundleConfig, assertReleaseVersion, missingEnvironment, releaseOverlay } from "./release-tools.mjs"

test("repository release versions and bundle identity are consistent", () => {
  assert.equal(assertReleaseVersion(), "0.6.0-team.1")
  assert.doesNotThrow(() => assertBundleConfig())
})

test("missingEnvironment reports names without exposing values", () => {
  assert.deepEqual(missingEnvironment(["ONE", "TWO", "THREE"], { ONE: "set", TWO: "", THREE: "  " }), ["TWO", "THREE"])
})

test("release overlay contains only the public updater material", () => {
  const overlay = releaseOverlay({ TAURI_UPDATER_PUBLIC_KEY: "public-key", SKILLGATE_RELEASE_PLATFORM: "linux" })
  assert.equal(overlay.plugins.updater.pubkey, "public-key")
  assert.equal(overlay.bundle.createUpdaterArtifacts, true)
  assert.deepEqual(overlay.bundle.targets, ["appimage", "deb"])
  assert.equal(JSON.stringify(overlay).includes("PRIVATE"), false)
})
