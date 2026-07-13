#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import {
  ROOT,
  assertBundleConfig,
  assertReleaseVersion,
  missingEnvironment,
  releaseOverlay,
} from "./release-tools.mjs"

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

try {
  const version = assertReleaseVersion()
  assertBundleConfig()

  const tag = option("--tag") ?? process.env.GITHUB_REF_NAME
  if (tag && tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} does not match VERSION; expected v${version}`)
  }

  if (args.includes("--require-signing")) {
    const required = [
      "TAURI_SIGNING_PRIVATE_KEY",
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
      "TAURI_UPDATER_PUBLIC_KEY",
      "WINDOWS_CERTIFICATE",
      "WINDOWS_CERTIFICATE_PASSWORD",
      "APPLE_CERTIFICATE",
      "APPLE_CERTIFICATE_PASSWORD",
      "APPLE_SIGNING_IDENTITY",
      "APPLE_ID",
      "APPLE_PASSWORD",
      "APPLE_TEAM_ID",
    ]
    const missing = missingEnvironment(required)
    if (missing.length) {
      throw new Error(`Release signing configuration is incomplete. Missing GitHub secrets/variables:\n${missing.map((name) => `- ${name}`).join("\n")}`)
    }
  }

  const output = option("--write-config")
  if (output) {
    const outputPath = path.resolve(ROOT, output)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, `${JSON.stringify(releaseOverlay(), null, 2)}\n`, { flag: "wx" })
    console.log(`Release overlay written to ${path.relative(ROOT, outputPath)}`)
  }

  console.log(`Release preflight passed for Skillgate v${version}`)
} catch (error) {
  console.error(`Release preflight failed:\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

