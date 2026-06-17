/**
 * Interim team-api client until Stream A exports `cli/src/team-api`.
 * Switch imports to `skillgate/team-api` when the package export is ready.
 */
import fs from "node:fs/promises"
import path from "node:path"
import simpleGit from "simple-git"
import { detectInstalledAgents } from "../../../cli/src/core/agents.js"
import { hashDirectory } from "../../../cli/src/core/content-hash.js"
import { installSkillForAgent, sanitizeName } from "../../../cli/src/core/installer.js"
import { readProtectList } from "../../../cli/src/core/protect.js"
import { readTeamProfile } from "../../../cli/src/core/profiles.js"
import { discoverSkills } from "../../../cli/src/core/skill-discovery.js"
import {
  readTeamLock,
  resolveVendoredSkillDir,
  writeTeamLock,
} from "../../../cli/src/core/team-lock.js"
import {
  getSkillgateStateDir,
  getSkillgateStatePath,
  getTeamSkillsRoot,
  getTeamVersionPath,
  readProjectProfile,
} from "../../../cli/src/core/team-config.js"
import type { AgentConfig, InstallMethod } from "../../../cli/src/types.js"

// ---------- Types (mirrors cli/src/team-api/types.ts) ----------

export type TeamErrorCode =
  | "TEAM_ROOT_MISSING"
  | "PROFILE_NOT_FOUND"
  | "NO_AGENTS"
  | "APPLY_PARTIAL_FAIL"
  | "LOCK_MISMATCH"
  | "NETWORK_TIMEOUT"
  | "UNKNOWN"

export interface TeamError {
  code: TeamErrorCode
  message: string
  details?: unknown
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: TeamError }

export interface TeamContext {
  teamRoot: string
  linkedProject: string | null
  effectiveProfile: string
  profileSource: "settings" | "linked" | "default"
}

export interface ProfileSummary {
  name: string
  description?: string
  skillCount: number
  agents?: string[]
}

export interface ApplySummary {
  profile: string
  installed: number
  failed: number
  failures: Array<{ skill: string; agent?: string; error: string }>
  method: InstallMethod
  agents: string[]
}

export interface DriftItem {
  skill: string
  kind: "missing" | "hash_mismatch" | "lock_missing" | "source_missing"
  expected?: string
  actual?: string
  path?: string
  agent?: string
}

export interface DoctorResult {
  profile: string
  drifts: DriftItem[]
  agentCount: number
}

export interface LockMismatch {
  skill: string
  lockHash: string
  diskHash: string
}

export interface LockVerifyResult {
  mismatches: LockMismatch[]
  written: boolean
}

export type CatalogDriftStatus = "ok" | "behind" | "unknown" | "throttled"

export interface CatalogDriftResult {
  status: CatalogDriftStatus
  localVersion?: string
  remoteVersion?: string
  fromCache: boolean
}

export interface LastApplyState {
  appliedAt: string
  profile: string
  revision?: number
  teamRoot: string
  method: InstallMethod
  agents: string[]
}

export interface ResolveTeamContextInput {
  teamRoot?: string | null
  linkedProject?: string | null
  profile?: string | null
}

const THROTTLE_SEC = 6 * 60 * 60

function err<T>(code: TeamErrorCode, message: string, details?: unknown): Result<T> {
  return { ok: false, error: { code, message, details } }
}

function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function readText(file: string): Promise<string | null> {
  try {
    return (await fs.readFile(file, "utf-8")).trim()
  } catch {
    return null
  }
}

export async function resolveTeamContext(
  input: ResolveTeamContextInput = {},
): Promise<Result<TeamContext>> {
  const teamRoot =
    input.teamRoot?.trim() ||
    process.env.SKILLGATE_ROOT ||
    getTeamSkillsRoot()

  if (!(await pathExists(teamRoot))) {
    return err("TEAM_ROOT_MISSING", `Team skills root not found: ${teamRoot}`)
  }

  const linkedProject = input.linkedProject?.trim() || null
  let effectiveProfile = input.profile?.trim() || ""
  let profileSource: TeamContext["profileSource"] = "default"

  if (effectiveProfile) {
    profileSource = "settings"
  } else if (linkedProject) {
    const linkedProfile = await readProjectProfile(linkedProject)
    if (linkedProfile) {
      effectiveProfile = linkedProfile
      profileSource = "linked"
    }
  }

  if (!effectiveProfile) {
    effectiveProfile = "quant"
    profileSource = "default"
  }

  return ok({
    teamRoot,
    linkedProject,
    effectiveProfile,
    profileSource,
  })
}

export async function listProfiles(ctx: TeamContext): Promise<Result<string[]>> {
  const profilesDir = path.join(ctx.teamRoot, "profiles")
  if (!(await pathExists(profilesDir))) {
    return err("PROFILE_NOT_FOUND", `Profiles directory not found: ${profilesDir}`)
  }

  const files = await fs.readdir(profilesDir)
  const names = files
    .filter((file) => file.endsWith(".yaml"))
    .map((file) => file.replace(/\.yaml$/, ""))
    .sort()

  return ok(names)
}

export async function getProfileSummary(
  ctx: TeamContext,
  name: string,
): Promise<Result<ProfileSummary>> {
  try {
    const profile = await readTeamProfile(name, ctx.teamRoot)
    return ok({
      name: profile.name,
      description: profile.description,
      skillCount: profile.skills.length,
      agents: profile.agents,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err("PROFILE_NOT_FOUND", message)
  }
}

export async function runApply(
  ctx: TeamContext,
  opts: {
    profile?: string
    writeLock?: boolean
    dryRun?: boolean
    method?: InstallMethod
    agents?: string[]
  } = {},
): Promise<Result<ApplySummary>> {
  const profileName = opts.profile ?? ctx.effectiveProfile

  try {
    const lock = await readTeamLock(ctx.teamRoot)
    const profile = await readTeamProfile(profileName, ctx.teamRoot)
    const protect = await readProtectList(ctx.teamRoot)

    let targetAgents = (await detectInstalledAgents()).filter(
      (a) => a.name !== "universal",
    )
    if (profile.agents?.length) {
      const allowed = new Set(profile.agents)
      targetAgents = targetAgents.filter((a) => allowed.has(a.name))
    }
    if (opts.agents?.length) {
      const allowed = new Set(opts.agents)
      targetAgents = targetAgents.filter((a) => allowed.has(a.name))
    }

    if (targetAgents.length === 0) {
      return err("NO_AGENTS", "No target agents detected.")
    }

    const method: InstallMethod =
      opts.method ?? (process.platform === "win32" ? "copy" : "symlink")

    let installed = 0
    let failed = 0
    const failures: ApplySummary["failures"] = []

    for (const skillName of profile.skills) {
      if (protect.has(skillName.toLowerCase())) {
        continue
      }

      const entry = lock.skills[skillName]
      if (!entry) {
        failed++
        failures.push({ skill: skillName, error: "No lock entry" })
        continue
      }

      if (entry.source !== "vendored") {
        failed++
        failures.push({
          skill: skillName,
          error: `Unsupported source: ${entry.source} (vendored only)`,
        })
        continue
      }

      const skillDir = resolveVendoredSkillDir(entry, ctx.teamRoot)
      const dirHash = await hashDirectory(skillDir)

      if (opts.writeLock && !opts.dryRun) {
        lock.skills[skillName] = { ...entry, contentHash: dirHash }
      }

      if (opts.dryRun) {
        installed += targetAgents.length
        continue
      }

      const skills = await discoverSkills(skillDir)
      if (skills.length === 0) {
        failed++
        failures.push({ skill: skillName, error: `No SKILL.md in ${skillDir}` })
        continue
      }

      const skill = skills[0]
      for (const agent of targetAgents) {
        const result = await installSkillForAgent(
          skill,
          agent as AgentConfig,
          "global",
          method,
        )
        if (!result.success) {
          failed++
          failures.push({
            skill: skillName,
            agent: agent.name,
            error: result.error ?? "Install failed",
          })
        } else {
          installed++
        }
      }
    }

    if (!opts.dryRun) {
      if (opts.writeLock) {
        lock.revision = (lock.revision ?? 0) + 1
        await writeTeamLock(lock, ctx.teamRoot)
      }

      await fs.mkdir(path.dirname(getSkillgateStatePath()), { recursive: true })
      await fs.writeFile(
        getSkillgateStatePath(),
        JSON.stringify(
          {
            appliedAt: new Date().toISOString(),
            profile: profileName,
            revision: lock.revision,
            teamRoot: ctx.teamRoot,
            method,
            agents: targetAgents.map((a) => a.name),
          },
          null,
          2,
        ),
        "utf-8",
      )
    }

    const summary: ApplySummary = {
      profile: profileName,
      installed,
      failed,
      failures,
      method,
      agents: targetAgents.map((a) => a.name),
    }

    if (failed > 0) {
      return err("APPLY_PARTIAL_FAIL", `${failed} failure(s) during apply`, summary)
    }

    return ok(summary)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err("UNKNOWN", message)
  }
}

export async function runDoctor(
  ctx: TeamContext,
  opts: { profile?: string } = {},
): Promise<Result<DoctorResult>> {
  const profileName = opts.profile ?? ctx.effectiveProfile

  try {
    const lock = await readTeamLock(ctx.teamRoot)
    const profile = await readTeamProfile(profileName, ctx.teamRoot)
    const drifts: DriftItem[] = []

    let targetAgents = (await detectInstalledAgents()).filter(
      (a) => a.name !== "universal",
    )
    if (profile.agents?.length) {
      const allowed = new Set(profile.agents)
      targetAgents = targetAgents.filter((a) => allowed.has(a.name))
    }

    for (const skillName of profile.skills) {
      const entry = lock.skills[skillName]
      if (!entry) {
        drifts.push({ skill: skillName, kind: "lock_missing" })
        continue
      }

      if (entry.source !== "vendored" || !entry.path) {
        drifts.push({ skill: skillName, kind: "source_missing" })
        continue
      }

      const sourceDir = resolveVendoredSkillDir(entry, ctx.teamRoot)
      if (!(await pathExists(sourceDir))) {
        drifts.push({ skill: skillName, kind: "source_missing", path: sourceDir })
        continue
      }

      const sourceHash = await hashDirectory(sourceDir)
      if (entry.contentHash && entry.contentHash !== sourceHash) {
        drifts.push({
          skill: skillName,
          kind: "hash_mismatch",
          expected: entry.contentHash,
          actual: sourceHash,
          path: sourceDir,
        })
      }

      const expected = entry.contentHash || sourceHash
      if (targetAgents.length === 0) {
        drifts.push({ skill: skillName, kind: "missing", expected })
        continue
      }

      for (const agent of targetAgents) {
        const installedDir = path.join(
          agent.globalSkillsDir,
          sanitizeName(skillName),
        )
        if (!(await pathExists(installedDir))) {
          drifts.push({
            skill: skillName,
            kind: "missing",
            path: installedDir,
            expected,
            agent: agent.name,
          })
          continue
        }

        const installedHash = await hashDirectory(installedDir)
        if (installedHash !== expected) {
          drifts.push({
            skill: skillName,
            kind: "hash_mismatch",
            expected,
            actual: installedHash,
            path: installedDir,
            agent: agent.name,
          })
        }
      }
    }

    return ok({
      profile: profileName,
      drifts,
      agentCount: targetAgents.length,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err("UNKNOWN", message)
  }
}

export async function runLockVerify(
  ctx: TeamContext,
  opts: { write?: boolean } = {},
): Promise<Result<LockVerifyResult>> {
  try {
    const lock = await readTeamLock(ctx.teamRoot)
    const mismatches: LockMismatch[] = []

    for (const [name, entry] of Object.entries(lock.skills)) {
      if (entry.source !== "vendored") continue
      const dir = resolveVendoredSkillDir(entry, ctx.teamRoot)
      const hash = await hashDirectory(dir)
      if (entry.contentHash !== hash) {
        mismatches.push({
          skill: name,
          lockHash: entry.contentHash ?? "(empty)",
          diskHash: hash,
        })
        if (opts.write) {
          lock.skills[name] = { ...entry, contentHash: hash }
        }
      }
    }

    let written = false
    if (opts.write && mismatches.length > 0) {
      lock.revision = (lock.revision ?? 0) + 1
      await writeTeamLock(lock, ctx.teamRoot)
      written = true
    }

    if (mismatches.length > 0 && !opts.write) {
      return err("LOCK_MISMATCH", `${mismatches.length} hash mismatch(es)`, {
        mismatches,
        written,
      })
    }

    return ok({ mismatches, written })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err("UNKNOWN", message)
  }
}

export async function checkCatalogDrift(
  ctx: TeamContext,
  opts: { force?: boolean } = {},
): Promise<Result<CatalogDriftResult>> {
  const force = opts.force ?? false
  const stateDir = getSkillgateStateDir()
  const cacheFile = path.join(stateDir, "last-update-check")
  const versionFile = getTeamVersionPath(ctx.teamRoot)

  if (!force) {
    const last = Number(await readText(cacheFile)) || 0
    if (Date.now() / 1000 - last < THROTTLE_SEC) {
      return ok({ status: "throttled", fromCache: true })
    }
  }

  await fs.mkdir(stateDir, { recursive: true })
  await fs.writeFile(cacheFile, String(Math.floor(Date.now() / 1000)), "utf-8")

  const localVer = await readText(versionFile)
  if (!localVer) {
    return ok({ status: "unknown", fromCache: false })
  }

  const remoteUrl = process.env.SKILLGATE_TEAM_REMOTE_URL?.trim()
  const remoteRepo = process.env.SKILLGATE_TEAM_REMOTE_REPO?.trim()

  if (remoteUrl) {
    try {
      const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(5000) })
      const remoteVer = (await res.text()).trim()
      if (remoteVer && remoteVer !== localVer) {
        return ok({
          status: "behind",
          localVersion: localVer,
          remoteVersion: remoteVer,
          fromCache: false,
        })
      }
      return ok({
        status: "ok",
        localVersion: localVer,
        remoteVersion: remoteVer,
        fromCache: false,
      })
    } catch {
      return err("NETWORK_TIMEOUT", "Failed to fetch remote version URL")
    }
  }

  if (remoteRepo) {
    try {
      const git = simpleGit()
      const ls = await git.listRemote([remoteRepo, "HEAD"])
      const remoteHash = ls.trim().split(/\s+/)[0]?.slice(0, 8)
      const localGit = simpleGit(ctx.teamRoot)
      const localHash = (await localGit.revparse(["HEAD"])).trim().slice(0, 8)
      if (remoteHash && localHash && remoteHash !== localHash) {
        return ok({
          status: "behind",
          localVersion: localHash,
          remoteVersion: remoteHash,
          fromCache: false,
        })
      }
      return ok({
        status: "ok",
        localVersion: localHash,
        remoteVersion: remoteHash,
        fromCache: false,
      })
    } catch {
      return err("NETWORK_TIMEOUT", "Failed to compare remote git repo")
    }
  }

  return ok({
    status: "ok",
    localVersion: localVer,
    fromCache: false,
  })
}

export async function getLastApplyState(): Promise<LastApplyState | null> {
  const raw = await readText(getSkillgateStatePath())
  if (!raw) return null
  try {
    return JSON.parse(raw) as LastApplyState
  } catch {
    return null
  }
}