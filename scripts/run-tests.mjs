import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs")

const allSuites = [
  { name: "desktop", cwd: path.join(root, "desktop") },
  { name: "cli", cwd: path.join(root, "cli") },
]

const filter = process.argv[2]
const suites = filter
  ? allSuites.filter((s) => s.name === filter)
  : allSuites

if (filter && suites.length === 0) {
  console.error(`[test] unknown suite "${filter}" (desktop | cli)`)
  process.exit(1)
}

for (const { name, cwd } of suites) {
  const result = spawnSync(process.execPath, [vitest, "run"], {
    cwd,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    console.error(`[test] ${name} failed with exit code ${result.status ?? 1}`)
    process.exit(result.status ?? 1)
  }
}

console.log("[test] all suites passed")