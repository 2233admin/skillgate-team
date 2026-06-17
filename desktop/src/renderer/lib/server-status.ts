// apps/desktop/src/renderer/lib/server-status.ts

export type DotColor = "green" | "amber" | "red" | "grey"

export type ServerStatusKind =
  | "syncFailed"
  | "neverSynced"
  | "pendingPush"
  | "onlyOnRemote"
  | "inSync"

export interface ServerStatus {
  dotColor: DotColor
  kind: ServerStatusKind
  localCount?: number
  pendingPush?: number
  onlyOnRemote?: number
}

export interface RemoteSkillForStatus {
  remotePath: string
  contentHash: string | null
}

export interface LocalSkillForStatus {
  folderName: string
  contentHash: string
  displayName?: string
}

export type SkillSyncStatusKind =
  | "newLocal"
  | "needsPush"
  | "inSync"
  | "onlyRemote"

export interface SkillSyncEntry {
  folderName: string
  displayName: string
  kind: SkillSyncStatusKind
}

export interface SkillSyncDiff {
  entries: SkillSyncEntry[]
  counts: Record<SkillSyncStatusKind, number>
}

type ServerLike = { lastSyncAt: string | null; lastSyncError: string | null }

/** Map remote SKILL.md paths to folder name → content hash. */
export function remoteSkillsByFolder(
  remoteSkills: RemoteSkillForStatus[],
): Map<string, string | null> {
  const remoteByFolder = new Map<string, string | null>()
  for (const r of remoteSkills) {
    if (!r.remotePath.endsWith("/SKILL.md")) continue
    const skillDir = r.remotePath.slice(0, -"/SKILL.md".length)
    const folderName = skillDir.split("/").filter(Boolean).pop() ?? ""
    if (!folderName) continue
    remoteByFolder.set(folderName, r.contentHash)
  }
  return remoteByFolder
}

/**
 * Per-skill sync state between local canonical skills and cached remote rows.
 * Does not contact SSH — uses the same matching rules as aggregate status.
 */
export function computeSkillSyncDiff(
  localSkills: LocalSkillForStatus[],
  remoteSkills: RemoteSkillForStatus[],
): SkillSyncDiff {
  const remoteByFolder = remoteSkillsByFolder(remoteSkills)
  const localFolders = new Set<string>()
  const entries: SkillSyncEntry[] = []

  const counts: Record<SkillSyncStatusKind, number> = {
    newLocal: 0,
    needsPush: 0,
    inSync: 0,
    onlyRemote: 0,
  }

  for (const local of localSkills) {
    localFolders.add(local.folderName)
    const remoteHash = remoteByFolder.get(local.folderName)
    let kind: SkillSyncStatusKind
    if (remoteHash === undefined) {
      kind = "newLocal"
    } else if (remoteHash !== local.contentHash) {
      kind = "needsPush"
    } else {
      kind = "inSync"
    }
    counts[kind]++
    entries.push({
      folderName: local.folderName,
      displayName: local.displayName ?? local.folderName,
      kind,
    })
  }

  for (const folder of remoteByFolder.keys()) {
    if (!localFolders.has(folder)) {
      counts.onlyRemote++
      entries.push({
        folderName: folder,
        displayName: folder,
        kind: "onlyRemote",
      })
    }
  }

  entries.sort((a, b) => {
    const order: Record<SkillSyncStatusKind, number> = {
      needsPush: 0,
      newLocal: 1,
      onlyRemote: 2,
      inSync: 3,
    }
    const byKind = order[a.kind] - order[b.kind]
    if (byKind !== 0) return byKind
    return a.displayName.localeCompare(b.displayName)
  })

  return { entries, counts }
}

/**
 * Derive the row-level status hint from cached state. Pure function — no SSH,
 * no IPC. Priority order: error > never synced > additions/updates > only-on-remote > in sync.
 *
 * - localSkills: the canonical local skills (already loaded by Servers view)
 * - remoteSkills: the cached `remote_skills` rows for this server
 *
 * `remoteSkills` is matched to local by folder name (the basename of the path
 * before "/SKILL.md") to tolerate "~/.agents/skills" vs "$HOME/..." differences.
 */
export function computeServerStatus(
  server: ServerLike,
  localSkills: LocalSkillForStatus[],
  remoteSkills: RemoteSkillForStatus[],
): ServerStatus {
  if (server.lastSyncError) {
    return { dotColor: "red", kind: "syncFailed" }
  }
  if (!server.lastSyncAt) {
    return { dotColor: "grey", kind: "neverSynced" }
  }

  const remoteByFolder = remoteSkillsByFolder(remoteSkills)

  let pendingPush = 0
  let onlyOnRemote = 0

  const localFolders = new Set<string>()
  for (const local of localSkills) {
    localFolders.add(local.folderName)
    const remoteHash = remoteByFolder.get(local.folderName)
    if (remoteHash === undefined) {
      pendingPush++
    } else if (remoteHash !== local.contentHash) {
      pendingPush++
    }
  }

  for (const folder of remoteByFolder.keys()) {
    if (!localFolders.has(folder)) onlyOnRemote++
  }

  const localCount = localSkills.length

  if (pendingPush > 0) {
    return {
      dotColor: "amber",
      kind: "pendingPush",
      localCount,
      pendingPush,
    }
  }

  if (onlyOnRemote > 0) {
    return {
      dotColor: "grey",
      kind: "onlyOnRemote",
      localCount,
      onlyOnRemote,
    }
  }

  return {
    dotColor: "green",
    kind: "inSync",
    localCount,
  }
}
