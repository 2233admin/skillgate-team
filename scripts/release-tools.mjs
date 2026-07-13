import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"))
}

export function releaseVersion() {
  return fs.readFileSync(path.join(ROOT, "VERSION"), "utf8").trim()
}

export function assertReleaseVersion(version = releaseVersion()) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`VERSION must be SemVer without a leading v; received ${JSON.stringify(version)}`)
  }

  const packageFiles = [
    "package.json",
    "cli/package.json",
    "tui/package.json",
    "desktop/package.json",
    "desktop-tauri/package.json",
  ]
  const mismatches = packageFiles
    .map((file) => ({ file, actual: readJson(file).version }))
    .filter(({ actual }) => actual !== version)

  const tauriConfig = readJson("desktop-tauri/src-tauri/tauri.conf.json")
  if (tauriConfig.version !== version) mismatches.push({ file: "desktop-tauri/src-tauri/tauri.conf.json", actual: tauriConfig.version })

  const cargo = fs.readFileSync(path.join(ROOT, "desktop-tauri/src-tauri/Cargo.toml"), "utf8")
  const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  if (cargoVersion !== version) mismatches.push({ file: "desktop-tauri/src-tauri/Cargo.toml", actual: cargoVersion })

  if (mismatches.length) {
    throw new Error(`Release version ${version} is inconsistent:\n${mismatches.map(({ file, actual }) => `- ${file}: ${actual ?? "missing"}`).join("\n")}`)
  }
  return version
}

export function assertBundleConfig(config = readJson("desktop-tauri/src-tauri/tauri.conf.json")) {
  if (config.identifier !== "ai.skillgate.desktop") throw new Error("Tauri identifier must remain ai.skillgate.desktop")
  if (config.bundle?.active !== true) throw new Error("Tauri bundle.active must be true for a release")
  if (JSON.stringify(config.bundle?.targets) !== JSON.stringify(["nsis"])) {
    throw new Error("The checked-in Windows bundle target must be nsis")
  }
  const icons = config.bundle?.icon ?? []
  if (!icons.some((icon) => icon.endsWith(".icns")) || !icons.some((icon) => icon.endsWith(".ico"))) {
    throw new Error("Tauri bundle icons must include both .icns and .ico assets")
  }
  for (const icon of icons) {
    const iconPath = path.join(ROOT, "desktop-tauri/src-tauri", icon)
    if (!fs.existsSync(iconPath)) throw new Error(`Missing bundle icon: ${icon}`)
  }
}

export function missingEnvironment(names, env = process.env) {
  return names.filter((name) => !env[name]?.trim())
}

export function releaseOverlay(env = process.env) {
  const publicKey = env.TAURI_UPDATER_PUBLIC_KEY?.trim()
  if (!publicKey) throw new Error("TAURI_UPDATER_PUBLIC_KEY is required to generate the release configuration")
  const targets = {
    windows: ["nsis"],
    macos: ["app", "dmg"],
    linux: ["appimage", "deb"],
  }[env.SKILLGATE_RELEASE_PLATFORM]
  if (!targets) throw new Error("SKILLGATE_RELEASE_PLATFORM must be windows, macos, or linux")
  const overlay = {
    bundle: { createUpdaterArtifacts: true, targets },
    plugins: {
      updater: {
        pubkey: publicKey,
        endpoints: ["https://github.com/2233admin/skillgate-team/releases/latest/download/latest.json"],
      },
    },
  }
  if (env.WINDOWS_CERTIFICATE_THUMBPRINT?.trim()) {
    overlay.bundle.windows = {
      certificateThumbprint: env.WINDOWS_CERTIFICATE_THUMBPRINT.trim(),
      digestAlgorithm: "sha256",
      timestampUrl: "http://timestamp.digicert.com",
    }
  }
  return overlay
}

export function filesRecursively(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name)
    return entry.isDirectory() ? filesRecursively(item) : [item]
  })
}

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}
