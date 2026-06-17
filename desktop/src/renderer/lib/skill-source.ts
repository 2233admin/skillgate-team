/** Classify installed skills by where they can be updated from (skills-lock). */

const GITHUB_SOURCE_TYPES = new Set(["github", "skillsgate", "skillgate"])

const LOCAL_PATH_PREFIX = /^(\.\/|\.\.\/|\/|~\/|[a-zA-Z]:[\\/])/

export type SkillSourceKind = "github" | "git" | "localOnly"

/** @deprecated Use SkillSourceKind — kept for gradual migration */
export type SkillUpdateKind = SkillSourceKind

export function skillFolderName(canonicalPath: string): string {
  const normalized = canonicalPath.replace(/\\/g, "/")
  return normalized.split("/").filter(Boolean).pop() ?? ""
}

function isLocalPathSource(source: string): boolean {
  return LOCAL_PATH_PREFIX.test(source)
}

export function classifySourceString(source?: string): SkillSourceKind {
  return getSkillSourceKind({ source })
}

/** skills.sh catalog rows use owner/repo — treat as GitHub unless URL-shaped. */
export function getCatalogSourceKind(catalogSource: string): SkillSourceKind {
  const source = catalogSource.trim()
  if (!source) return "localOnly"
  if (source.includes("github.com")) return "github"
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "git"
  }
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:@.+)?$/.test(source)) {
    return "github"
  }
  return classifySourceString(source)
}

export function getSkillSourceKind(skill: {
  source?: string
  sourceType?: string
}): SkillSourceKind {
  const source = skill.source?.trim() ?? ""
  const sourceType = skill.sourceType?.trim() ?? ""

  if (!source) return "localOnly"
  if (sourceType === "local") return "localOnly"
  if (isLocalPathSource(source)) return "localOnly"

  if (sourceType === "git") return "git"
  if (GITHUB_SOURCE_TYPES.has(sourceType)) return "github"

  if (source.includes("github.com")) return "github"
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "git"
  }

  // owner/repo shorthand and legacy lock entries without sourceType
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:@.+)?$/.test(source)) {
    return "github"
  }

  if (source.includes("/")) return "git"

  return "localOnly"
}

/** @deprecated Use getSkillSourceKind */
export function getSkillUpdateKind(skill: {
  source?: string
  sourceType?: string
}): SkillSourceKind {
  return getSkillSourceKind(skill)
}

export function isUpdatableFromSource(kind: SkillSourceKind): boolean {
  return kind === "github" || kind === "git"
}

/** Whether desktop/CLI installSkill can parse this source string. */
export function isInstallableSource(source: string): boolean {
  const trimmed = source.trim()
  if (!trimmed) return false
  if (isLocalPathSource(trimmed)) return true
  return isUpdatableFromSource(classifySourceString(trimmed))
}

/** Short label for self-hosted Git badges (hostname from stored source URL). */
export function gitHostLabel(source?: string): string | null {
  if (!source?.trim()) return null
  try {
    const url = source.startsWith("http") ? new URL(source) : null
    return url?.hostname ?? null
  } catch {
    return null
  }
}