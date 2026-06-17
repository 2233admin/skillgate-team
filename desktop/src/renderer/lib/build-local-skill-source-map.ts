import {
  getSkillSourceKind,
  skillFolderName,
  type SkillSourceKind,
} from "./skill-source"

export type LocalSkillSourceEntry = {
  kind: SkillSourceKind
  source?: string
}

export type InstalledSkillForSourceMap = {
  canonicalPath: string
  source?: string
  sourceType?: string
  scope: string
}

/**
 * Pure: map global skill folder name → install source from listInstalled rows.
 * Project-scoped and rows without canonicalPath are ignored.
 * When multiple rows share a folder, prefer the entry with a remote source kind.
 */
export function buildLocalSkillSourceByFolder(
  list: InstalledSkillForSourceMap[],
): Map<string, LocalSkillSourceEntry> {
  const map = new Map<string, LocalSkillSourceEntry>()

  for (const skill of list) {
    if (skill.scope !== "global" || !skill.canonicalPath) continue
    const folder = skillFolderName(skill.canonicalPath)
    if (!folder) continue

    const kind = getSkillSourceKind(skill)
    const entry: LocalSkillSourceEntry = { kind, source: skill.source }
    const existing = map.get(folder)

    if (
      !existing ||
      (existing.kind === "localOnly" && kind !== "localOnly")
    ) {
      map.set(folder, entry)
    }
  }

  return map
}