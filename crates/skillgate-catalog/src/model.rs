use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRef {
    pub grant_id: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RootGrant {
    pub grant_id: String,
    pub display_name: String,
    pub persisted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogKind {
    Skill,
    Agent,
    Rule,
    Context,
}

impl CatalogKind {
    pub(crate) const ALL: [Self; 4] = [Self::Skill, Self::Agent, Self::Rule, Self::Context];

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Skill => "skill",
            Self::Agent => "agent",
            Self::Rule => "rule",
            Self::Context => "context",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogPlatform {
    Cursor,
    Claude,
    Codex,
    Shared,
}

impl CatalogPlatform {
    pub(crate) const ALL: [Self; 4] = [Self::Cursor, Self::Claude, Self::Codex, Self::Shared];

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Cursor => "cursor",
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Shared => "shared",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogScope {
    Global,
    Project,
}

impl CatalogScope {
    pub(crate) const ALL: [Self; 2] = [Self::Global, Self::Project];

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::Project => "project",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogInstallationLevel {
    Global,
    Project,
    Plugin,
    External,
}

impl CatalogInstallationLevel {
    pub(crate) const ALL: [Self; 4] = [Self::Global, Self::Project, Self::Plugin, Self::External];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogSourceKind {
    Local,
    Plugin,
    Manifest,
    External,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogUsageStatus {
    Untracked,
    Active,
    Stale,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogRiskLevel {
    Low,
    Medium,
    High,
}

impl CatalogRiskLevel {
    pub(crate) const ALL: [Self; 3] = [Self::Low, Self::Medium, Self::High];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CatalogRiskSignal {
    DestructiveCommand,
    RemoteExecution,
    ElevatedPrivileges,
    CredentialAccess,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSkillMetadata {
    pub compatible_with: Vec<CatalogPlatform>,
    pub installation_level: CatalogInstallationLevel,
    pub source_kind: CatalogSourceKind,
    pub source_label: String,
    pub usage_status: CatalogUsageStatus,
    pub usage_count: Option<u64>,
    pub last_used_at: Option<String>,
    pub installation_count: usize,
    pub risk_level: CatalogRiskLevel,
    pub risk_signals: Vec<CatalogRiskSignal>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAlias {
    pub location: PathRef,
    pub display_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogItem {
    pub item_id: String,
    pub canonical_item_id: String,
    pub kind: CatalogKind,
    pub platform: CatalogPlatform,
    pub scope: CatalogScope,
    pub project_name: Option<String>,
    pub group_id: String,
    pub group_label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill_meta: Option<CatalogSkillMetadata>,
    pub name: String,
    pub slug: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    pub location: PathRef,
    pub display_path: String,
    pub aliases: Vec<CatalogAlias>,
    pub created_at: Option<String>,
    pub modified_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogGroup {
    pub group_id: String,
    pub label: String,
    pub kind: CatalogKind,
    pub platform: CatalogPlatform,
    pub item_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSummary {
    pub total: usize,
    pub by_kind: BTreeMap<CatalogKind, usize>,
    pub by_platform: BTreeMap<CatalogPlatform, usize>,
    pub by_scope: BTreeMap<CatalogScope, usize>,
    pub by_installation_level: BTreeMap<CatalogInstallationLevel, usize>,
    pub by_risk_level: BTreeMap<CatalogRiskLevel, usize>,
    pub project_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSnapshot {
    pub grant: RootGrant,
    pub revision: String,
    pub groups: Vec<CatalogGroup>,
    pub items: Vec<CatalogItem>,
    pub summary: CatalogSummary,
    pub skipped_unreadable: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogFilter {
    pub query: Option<String>,
    pub kinds: Option<Vec<CatalogKind>>,
    pub platforms: Option<Vec<CatalogPlatform>>,
    pub scopes: Option<Vec<CatalogScope>>,
    pub installation_levels: Option<Vec<CatalogInstallationLevel>>,
    pub risk_levels: Option<Vec<CatalogRiskLevel>>,
    pub project_names: Option<Vec<String>>,
    pub group_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCatalogInput {
    pub grant_id: String,
    #[serde(default)]
    pub filter: Option<CatalogFilter>,
    #[serde(default)]
    pub offset: Option<usize>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCatalogOutput {
    pub revision: String,
    pub groups: Vec<CatalogGroup>,
    pub items: Vec<CatalogItem>,
    pub summary: CatalogSummary,
    pub total_matched: usize,
}
