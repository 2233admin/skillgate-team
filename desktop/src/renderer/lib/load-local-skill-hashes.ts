import { electronAPI } from "./electron-api"
import { sha256Hex } from "./content-hash"
import type { LocalSkillForStatus } from "./server-status"

/** Hash canonical global skills for sync comparison with remote cache. */
export async function loadLocalSkillHashes(): Promise<LocalSkillForStatus[]> {
  const list = (await electronAPI.listInstalled()) as Array<{
    name: string
    canonicalPath: string
    scope: string
  }>
  const canonical = list.filter((s) => s.scope === "global" && s.canonicalPath)
  const hashed: LocalSkillForStatus[] = []

  for (const s of canonical) {
    try {
      const content = (await electronAPI.readSkillContent(
        `${s.canonicalPath}/SKILL.md`,
      )) as string
      const folderName =
        s.canonicalPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? ""
      if (!folderName) continue
      const hash = await sha256Hex(content)
      hashed.push({
        folderName,
        contentHash: hash,
        displayName: s.name,
      })
    } catch {
      // Skip unreadable SKILL.md
    }
  }

  return hashed
}