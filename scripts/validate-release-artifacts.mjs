#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { ROOT, filesRecursively, releaseVersion, sha256 } from "./release-tools.mjs"

const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function validateManifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
  if (manifest.version !== releaseVersion() && manifest.version !== `v${releaseVersion()}`) {
    throw new Error(`latest.json version ${manifest.version} does not match ${releaseVersion()}`)
  }
  const platforms = Object.entries(manifest.platforms ?? {})
  for (const os of ["windows", "darwin", "linux"]) {
    const entries = platforms.filter(([name]) => name.startsWith(`${os}-`))
    if (!entries.length) throw new Error(`latest.json has no ${os} updater target`)
    for (const [name, value] of entries) {
      if (!value?.url?.startsWith("https://github.com/2233admin/skillgate-team/releases/download/")) {
        throw new Error(`latest.json ${name} has an unexpected update URL`)
      }
      if (!value?.signature?.trim()) throw new Error(`latest.json ${name} has no signature`)
    }
  }
  console.log(`Validated updater manifest with ${platforms.length} platform entries`)
}

function validateBundles(platform, directory) {
  const files = filesRecursively(directory)
  const relative = files.map((file) => path.relative(directory, file).replaceAll("\\", "/"))
  const required = {
    windows: [/-setup\.exe$/i, /\.exe\.sig$/i],
    macos: [/\.dmg$/i, /\.app\.tar\.gz$/i, /\.app\.tar\.gz\.sig$/i],
    linux: [/\.AppImage$/, /\.deb$/i, /\.AppImage\.sig$/],
  }[platform]
  if (!required) throw new Error(`Unsupported --platform ${platform}`)
  const mandatory = args.includes("--allow-unsigned")
    ? required.filter((pattern) => !pattern.source.includes("sig"))
    : required
  for (const pattern of mandatory) {
    if (!relative.some((file) => pattern.test(file))) throw new Error(`${platform} bundle is missing ${pattern}`)
  }

  const distributable = files.filter((file) => !file.endsWith(".sig") && !file.endsWith(".pdb") && !file.endsWith(".d"))
  const checksumFile = path.join(ROOT, `.release/SHA256SUMS-${platform}.txt`)
  fs.mkdirSync(path.dirname(checksumFile), { recursive: true })
  const checksums = distributable
    .map((file) => `${sha256(file)}  ${path.basename(file)}`)
    .sort()
    .join("\n")
  fs.writeFileSync(checksumFile, `${checksums}\n`)
  console.log(`Validated ${platform} bundles and wrote ${path.relative(ROOT, checksumFile)}`)
}

try {
  const manifest = option("--manifest")
  if (manifest) validateManifest(path.resolve(ROOT, manifest))
  else {
    const platform = option("--platform")
    if (!platform) throw new Error("Use --platform windows|macos|linux or --manifest <latest.json>")
    validateBundles(platform, path.resolve(ROOT, option("--directory") ?? "desktop-tauri/src-tauri/target/release/bundle"))
  }
} catch (error) {
  console.error(`Release artifact validation failed:\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
