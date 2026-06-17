import { electronAPI } from "./electron-api"
import {
  buildLocalSkillSourceByFolder,
  type InstalledSkillForSourceMap,
  type LocalSkillSourceEntry,
} from "./build-local-skill-source-map"

export type { InstalledSkillForSourceMap, LocalSkillSourceEntry }
export { buildLocalSkillSourceByFolder }

/** Map canonical folder name → install source from skills-lock (global skills only). */
export async function loadLocalSkillSourceByFolder(): Promise<
  Map<string, LocalSkillSourceEntry>
> {
  const list = (await electronAPI.listInstalled()) as InstalledSkillForSourceMap[]
  return buildLocalSkillSourceByFolder(list)
}