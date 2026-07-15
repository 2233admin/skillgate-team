import type {
  CatalogInstallationLevel,
  CatalogItem,
  CatalogPlatform,
  CatalogRiskLevel,
  CatalogRiskSignal,
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
  low: "No flags",
  medium: "Review",
  high: "High risk",
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

export function catalogSkillFacts(item: CatalogItem) {
  if (item.kind !== "skill" || !item.skillMeta) return null
  const meta = item.skillMeta
  return {
    adapters: meta.compatibleWith.map(platformLabel).join(" + "),
    installation: installationLabel(meta.installationLevel),
    source: meta.sourceLabel,
    usage: meta.usageStatus === "untracked"
      ? "Usage not tracked"
      : meta.usageStatus === "active"
        ? `${meta.usageCount ?? 0} recorded uses`
        : "No recent recorded use",
    locations: `${meta.installationCount} ${meta.installationCount === 1 ? "location" : "locations"}`,
    risk: riskLabel(meta.riskLevel),
    riskDetail: meta.riskSignals.length
      ? meta.riskSignals.map(riskSignalLabel).join(", ")
      : "No static risk flags found",
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
    item.skillMeta.sourceKind,
  ].join(" ")
}
