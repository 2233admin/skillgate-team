import type {
  CatalogInstallationLevel,
  CatalogItem,
  CatalogPlatform,
  CatalogRiskLevel,
  CatalogRiskSignal,
  CatalogSourceKind,
} from "../lib/app-api"

const platformLabels: Record<CatalogPlatform, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  shared: "Shared",
}

const installationLabels: Record<CatalogInstallationLevel, string> = {
  global: "Global",
  project: "Project",
  plugin: "Plugin",
  external: "External",
}

const riskLabels: Record<CatalogRiskLevel, string> = {
  low: "No signals",
  medium: "Review signals",
  high: "High-severity signals",
}

const riskSignalLabels: Record<CatalogRiskSignal, string> = {
  destructiveCommand: "Destructive commands",
  remoteExecution: "Remote execution",
  elevatedPrivileges: "Elevated privileges",
  credentialAccess: "Credential access",
}

export function platformLabel(platform: CatalogPlatform) {
  return platformLabels[platform]
}

export function installationLabel(level: CatalogInstallationLevel) {
  return installationLabels[level]
}

export function riskLabel(level: CatalogRiskLevel) {
  return riskLabels[level]
}

export function riskSignalLabel(signal: CatalogRiskSignal) {
  return riskSignalLabels[signal]
}

export function catalogItemSupportsPlatform(item: CatalogItem, platform: CatalogPlatform) {
  return item.platform === platform || item.skillMeta?.compatibleWith.includes(platform) === true
}

export function catalogSourceLabel(kind: CatalogSourceKind, label: string) {
  const detail = label.trim()
  if (kind === "manifest") return detail ? `Declared source · ${detail}` : "Declared source"
  if (kind === "plugin") return detail ? `Plugin · ${detail}` : "Plugin cache"
  if (kind === "external") return detail ? `External root · ${detail}` : "External root"
  return "Local filesystem"
}

export function catalogSkillFacts(item: CatalogItem) {
  if (item.kind !== "skill" || !item.skillMeta) return null
  const meta = item.skillMeta
  return {
    adapters: meta.compatibleWith.map(platformLabel).join(" + "),
    installation: installationLabel(meta.installationLevel),
    source: catalogSourceLabel(meta.sourceKind, meta.sourceLabel),
    usage: meta.usageStatus === "untracked"
      ? "Usage not tracked"
      : meta.usageStatus === "active"
        ? `${meta.usageCount ?? 0} recorded uses`
        : "No recent recorded use",
    locations: `${meta.installationCount} ${meta.installationCount === 1 ? "location" : "locations"}`,
    risk: riskLabel(meta.riskLevel),
    riskDetail: meta.riskSignals.length
      ? `SKILL.md static signals: ${meta.riskSignals.map(riskSignalLabel).join(", ")}. Partial check only; review in context.`
      : "No configured static signals were detected in SKILL.md; this limited check does not establish safety.",
  }
}

export function catalogSkillSearchText(item: CatalogItem) {
  const facts = catalogSkillFacts(item)
  if (!facts || !item.skillMeta) return ""
  return [
    facts.adapters,
    facts.installation,
    facts.source,
    facts.usage,
    facts.locations,
    facts.risk,
    facts.riskDetail,
    item.platform,
    platformLabel(item.platform),
    item.skillMeta.sourceKind,
  ].join(" ")
}
