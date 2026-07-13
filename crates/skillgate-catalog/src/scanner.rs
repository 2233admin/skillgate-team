use crate::error::{AppError, AppErrorCategory, AppErrorCode, AppResult};
use crate::model::{
    CatalogGroup, CatalogItem, CatalogKind, CatalogPlatform, CatalogScope, CatalogSnapshot,
    CatalogSummary, PathRef, RootGrant,
};
use crate::parser::parse_markdown;
use chrono::{DateTime, Utc};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::{DirEntry, WalkDir};

const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

pub(crate) fn scan_root(root: &Path, grant: RootGrant) -> AppResult<CatalogSnapshot> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| AppError::from_io(&error, "catalog root canonicalization"))?;
    let mut builder = SnapshotBuilder::new(&canonical_root, grant.clone());
    let walker = WalkDir::new(&canonical_root)
        .follow_links(false)
        .into_iter();
    for entry in walker.filter_entry(should_descend) {
        match entry {
            Ok(entry) => builder.inspect(entry.path()),
            Err(_) => builder.skipped_unreadable += 1,
        }
    }
    builder.finish()
}

struct SnapshotBuilder<'a> {
    root: &'a Path,
    grant: RootGrant,
    items: BTreeMap<PathBuf, CatalogItem>,
    content_digests: BTreeMap<String, String>,
    skipped_unreadable: usize,
}

impl<'a> SnapshotBuilder<'a> {
    fn new(root: &'a Path, grant: RootGrant) -> Self {
        Self {
            root,
            grant,
            items: BTreeMap::new(),
            content_digests: BTreeMap::new(),
            skipped_unreadable: 0,
        }
    }

    fn inspect(&mut self, path: &Path) {
        if path == self.root {
            return;
        }
        if is_link_like(path) {
            self.inspect_link(path);
            return;
        }
        if path.is_dir() {
            return;
        }
        let Ok(relative) = path.strip_prefix(self.root) else {
            self.skipped_unreadable += 1;
            return;
        };
        let Some(classification) = classify(relative) else {
            return;
        };
        if let Err(_error) = self.add_item(path, relative, classification, None) {
            self.skipped_unreadable += 1;
        }
    }

    fn inspect_link(&mut self, alias_path: &Path) {
        let Ok(canonical) = fs::canonicalize(alias_path) else {
            // Broken links, loops, and inaccessible reparse targets are isolated.
            self.skipped_unreadable += 1;
            return;
        };
        if !canonical.starts_with(self.root) || canonical == alias_path {
            self.skipped_unreadable += 1;
            return;
        }
        let Ok(alias_relative) = alias_path.strip_prefix(self.root) else {
            self.skipped_unreadable += 1;
            return;
        };

        if canonical.is_file() {
            self.add_link_target(&canonical, alias_relative);
            return;
        }
        if !canonical.is_dir() {
            self.skipped_unreadable += 1;
            return;
        }

        // A symlink/junction to an in-root catalog directory is an alias. Walk
        // the canonical target once without following any nested links.
        let walker = WalkDir::new(&canonical).follow_links(false).into_iter();
        for entry in walker.filter_entry(should_descend) {
            let Ok(entry) = entry else {
                self.skipped_unreadable += 1;
                continue;
            };
            if entry.path() == canonical || entry.path().is_dir() {
                continue;
            }
            if is_link_like(entry.path()) {
                self.skipped_unreadable += 1;
                continue;
            }
            let Ok(suffix) = entry.path().strip_prefix(&canonical) else {
                self.skipped_unreadable += 1;
                continue;
            };
            self.add_link_target(entry.path(), &alias_relative.join(suffix));
        }
    }

    fn add_link_target(&mut self, canonical: &Path, alias_relative: &Path) {
        let Ok(canonical_relative) = canonical.strip_prefix(self.root) else {
            self.skipped_unreadable += 1;
            return;
        };
        let Some(classification) = classify(canonical_relative) else {
            return;
        };
        if let Err(_error) = self.add_item(
            canonical,
            canonical_relative,
            classification,
            Some(alias_relative),
        ) {
            self.skipped_unreadable += 1;
        }
    }

    fn add_item(
        &mut self,
        path: &Path,
        relative: &Path,
        classification: Classification,
        alias_relative: Option<&Path>,
    ) -> AppResult<()> {
        // Authorize before opening anything. From this point onward all reads
        // use the verified canonical path, never the traversal/alias path.
        let canonical_path = fs::canonicalize(path)
            .map_err(|error| AppError::from_io(&error, "catalog canonicalization"))?;
        if !canonical_path.starts_with(self.root) {
            return Err(AppError::new(
                AppErrorCode::SymlinkEscape,
                AppErrorCategory::Authorization,
                "catalog item resolves outside the granted root",
            ));
        }
        let metadata = fs::metadata(&canonical_path)
            .map_err(|error| AppError::from_io(&error, "catalog metadata"))?;
        if metadata.len() > MAX_FILE_BYTES {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "catalog metadata file exceeds the read-only scan limit",
            ));
        }
        let content = fs::read_to_string(&canonical_path)
            .map_err(|error| AppError::from_io(&error, "catalog metadata read"))?;
        if content.len() as u64 > MAX_FILE_BYTES {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "catalog metadata changed beyond the read-only scan limit",
            ));
        }
        // Revalidate after the read. A reparse/symlink swap may have changed an
        // ancestor between authorization and I/O; changed/outside results are
        // discarded and never enter a snapshot.
        let canonical_after_read = fs::canonicalize(&canonical_path)
            .map_err(|error| AppError::from_io(&error, "catalog post-read validation"))?;
        if canonical_after_read != canonical_path || !canonical_after_read.starts_with(self.root) {
            return Err(AppError::new(
                AppErrorCode::SymlinkEscape,
                AppErrorCategory::Authorization,
                "catalog path changed or escaped during the read",
            ));
        }
        let fallback_name = fallback_name(relative, classification.kind);
        let parsed = parse_markdown(&content, &fallback_name);
        let relative_path = wire_path(relative);
        if let Some(existing) = self.items.get_mut(&canonical_path) {
            attach_alias(existing, &self.grant.grant_id, alias_relative);
            return Ok(());
        }

        let scope = if classification.config_index == 0 {
            CatalogScope::Global
        } else {
            CatalogScope::Project
        };
        let project_name = (scope == CatalogScope::Project)
            .then(|| relative.components().nth(classification.config_index - 1))
            .flatten()
            .map(|part| part.as_os_str().to_string_lossy().to_string());
        let slug = slugify(&parsed.name, &fallback_name);
        let group_label = classification
            .plugin_name
            .as_ref()
            .map(|name| format!("Plugin · {name}"))
            .or_else(|| project_name.clone())
            .unwrap_or_else(|| "Global".to_string());
        let group_id = stable_id(&format!(
            "group|{}|{}|{}|{}",
            classification.kind.label(),
            classification.platform.label(),
            scope.label(),
            group_label.to_lowercase()
        ));
        let canonical_item_id = stable_id(&format!(
            "catalog|{}|{}|{}|{}",
            classification.kind.label(),
            classification.platform.label(),
            scope.label(),
            relative_path.to_lowercase()
        ));

        let mut item = CatalogItem {
            item_id: canonical_item_id.clone(),
            canonical_item_id,
            kind: classification.kind,
            platform: classification.platform,
            scope,
            project_name,
            group_id,
            group_label,
            plugin_name: classification.plugin_name,
            name: parsed.name,
            slug,
            description: parsed.description,
            creator: parsed.creator,
            location: PathRef {
                grant_id: self.grant.grant_id.clone(),
                relative_path: relative_path.clone(),
            },
            display_path: relative_path,
            aliases: Vec::new(),
            created_at: metadata.created().ok().map(system_time),
            modified_at: system_time(metadata.modified().unwrap_or(std::time::UNIX_EPOCH)),
        };
        attach_alias(&mut item, &self.grant.grant_id, alias_relative);
        self.content_digests.insert(
            item.item_id.clone(),
            format!("{}:{}", metadata.len(), stable_id(&content)),
        );
        self.items.insert(canonical_path, item);
        Ok(())
    }

    fn finish(self) -> AppResult<CatalogSnapshot> {
        let SnapshotBuilder {
            grant,
            items,
            content_digests,
            skipped_unreadable,
            ..
        } = self;
        let mut items: Vec<_> = items.into_values().collect();
        for item in &mut items {
            item.aliases.sort_by(|left, right| {
                left.display_path
                    .to_lowercase()
                    .cmp(&right.display_path.to_lowercase())
                    .then_with(|| left.display_path.cmp(&right.display_path))
            });
            item.aliases
                .dedup_by(|left, right| left.location == right.location);
        }
        items.sort_by(item_order);
        let groups = groups_for(&items);
        let summary = summary_for(&items);
        let revision_material = items
            .iter()
            .map(|item| {
                let aliases = item
                    .aliases
                    .iter()
                    .map(|alias| alias.display_path.as_str())
                    .collect::<Vec<_>>()
                    .join(",");
                let digest = content_digests
                    .get(&item.item_id)
                    .map(String::as_str)
                    .unwrap_or("missing");
                format!("{}:{}:{digest}:{aliases}", item.item_id, item.modified_at)
            })
            .collect::<Vec<_>>()
            .join("|");
        Ok(CatalogSnapshot {
            grant,
            revision: stable_id(&format!("revision|{revision_material}")),
            groups,
            items,
            summary,
            skipped_unreadable,
        })
    }
}

fn attach_alias(item: &mut CatalogItem, grant_id: &str, alias_relative: Option<&Path>) {
    let Some(alias_relative) = alias_relative else {
        return;
    };
    let display_path = wire_path(alias_relative);
    if display_path == item.location.relative_path {
        return;
    }
    item.aliases.push(crate::model::CatalogAlias {
        location: PathRef {
            grant_id: grant_id.to_string(),
            relative_path: display_path.clone(),
        },
        display_path,
    });
}

fn is_link_like(path: &Path) -> bool {
    let Ok(metadata) = fs::symlink_metadata(path) else {
        return false;
    };
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        metadata.file_type().is_symlink_dir() || metadata.file_type().is_symlink_file()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[derive(Debug)]
struct Classification {
    kind: CatalogKind,
    platform: CatalogPlatform,
    config_index: usize,
    plugin_name: Option<String>,
}

fn classify(relative: &Path) -> Option<Classification> {
    let components: Vec<String> = relative
        .components()
        .map(|part| part.as_os_str().to_string_lossy().to_string())
        .collect();
    let file_name = components.last()?;

    if matches!(file_name.as_str(), "CLAUDE.md" | "claude.md" | "AGENTS.md") {
        let (platform, config_index) = match file_name.as_str() {
            "AGENTS.md" => (CatalogPlatform::Shared, components.len().saturating_sub(1)),
            _ => (CatalogPlatform::Claude, components.len().saturating_sub(1)),
        };
        return Some(Classification {
            kind: CatalogKind::Context,
            platform,
            config_index,
            plugin_name: None,
        });
    }

    let (config_index, platform) = components.iter().enumerate().find_map(|(index, part)| {
        let platform = match part.as_str() {
            ".cursor" => CatalogPlatform::Cursor,
            ".claude" => CatalogPlatform::Claude,
            ".codex" => CatalogPlatform::Codex,
            ".agents" => CatalogPlatform::Shared,
            _ => return None,
        };
        Some((index, platform))
    })?;
    let tail = &components[config_index + 1..];

    let standard_skill = tail.first().is_some_and(|part| part == "skills");
    let cursor_builtin_skill = platform == CatalogPlatform::Cursor
        && tail.first().is_some_and(|part| part == "skills-cursor");
    let plugin_skill = platform != CatalogPlatform::Shared
        && tail.windows(2).any(|parts| parts == ["plugins", "cache"]);
    if file_name == "SKILL.md" && (standard_skill || cursor_builtin_skill || plugin_skill) {
        let plugin_name = plugin_name(tail);
        return Some(Classification {
            kind: CatalogKind::Skill,
            platform,
            config_index,
            plugin_name,
        });
    }
    if platform != CatalogPlatform::Shared
        && tail.len() == 2
        && tail.first().is_some_and(|part| part == "agents")
        && file_name.ends_with(".md")
    {
        return Some(Classification {
            kind: CatalogKind::Agent,
            platform,
            config_index,
            plugin_name: None,
        });
    }
    if matches!(platform, CatalogPlatform::Cursor | CatalogPlatform::Codex)
        && tail.len() == 2
        && tail.first().is_some_and(|part| part == "rules")
        && file_name.ends_with(".mdc")
    {
        return Some(Classification {
            kind: CatalogKind::Rule,
            platform,
            config_index,
            plugin_name: None,
        });
    }
    None
}

fn plugin_name(tail: &[String]) -> Option<String> {
    let cache_index = tail
        .windows(2)
        .position(|parts| parts == ["plugins", "cache"])?
        + 2;
    // Common layouts are cache/<hash>/<plugin>/... and cache/<plugin>/... .
    let after_cache = tail.get(cache_index..)?;
    match after_cache {
        [plugin, next, ..] if next == "skills" => Some(plugin.clone()),
        [_, plugin, ..] => Some(plugin.clone()),
        [plugin] => Some(plugin.clone()),
        [] => None,
    }
}

fn should_descend(entry: &DirEntry) -> bool {
    if !entry.file_type().is_dir() || entry.depth() == 0 {
        return true;
    }
    !is_noise_directory(entry.path(), &entry.file_name().to_string_lossy())
}

fn is_noise_directory(path: &Path, name: &str) -> bool {
    if name == "pkg"
        && path
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|parent| parent == "go")
    {
        return true;
    }

    matches!(
        name,
        "node_modules"
            | "bower_components"
            | ".pnpm-store"
            | ".yarn"
            | ".turbo"
            | ".parcel-cache"
            | ".nuxt"
            | ".output"
            | ".svelte-kit"
            | ".angular"
            | ".docusaurus"
            | ".vite"
            | ".astro"
            | "jspm_packages"
            | "web_modules"
            | ".npm"
            | ".sass-cache"
            | ".nyc_output"
            | "target"
            | ".cargo"
            | ".rustup"
            | ".venv"
            | "venv"
            | "site-packages"
            | "__pycache__"
            | ".tox"
            | ".mypy_cache"
            | ".pytest_cache"
            | ".ruff_cache"
            | ".eggs"
            | "__pypackages__"
            | ".nox"
            | ".ipynb_checkpoints"
            | ".hatch"
            | ".pdm-build"
            | ".bundle"
            | ".dart_tool"
            | "_build"
            | "deps"
            | ".stack-work"
            | "dist-newstyle"
            | ".gradle"
            | ".m2"
            | "Pods"
            | ".swiftpm"
            | "DerivedData"
            | "Carthage"
            | ".terraform"
            | ".terragrunt-cache"
            | ".serverless"
            | ".vscode"
            | ".idea"
            | ".vs"
            | ".fleet"
            | ".history"
            | ".svn"
            | ".hg"
            | "$RECYCLE.BIN"
            | "System Volume Information"
            | "Library"
            | ".Trash"
            | "dist"
            | ".git"
            | "build"
            | ".next"
            | "vendor"
            | "coverage"
            | "cache"
            | ".cache"
            | "Caches"
    )
}

pub(crate) fn groups_for(items: &[CatalogItem]) -> Vec<CatalogGroup> {
    let mut groups: BTreeMap<String, CatalogGroup> = BTreeMap::new();
    for item in items {
        groups
            .entry(item.group_id.clone())
            .or_insert_with(|| CatalogGroup {
                group_id: item.group_id.clone(),
                label: item.group_label.clone(),
                kind: item.kind,
                platform: item.platform,
                item_ids: Vec::new(),
            })
            .item_ids
            .push(item.item_id.clone());
    }
    let mut groups: Vec<_> = groups.into_values().collect();
    groups.sort_by(|left, right| {
        left.label
            .to_lowercase()
            .cmp(&right.label.to_lowercase())
            .then_with(|| left.kind.cmp(&right.kind))
            .then_with(|| left.platform.cmp(&right.platform))
            .then_with(|| left.group_id.cmp(&right.group_id))
    });
    groups
}

pub(crate) fn summary_for(items: &[CatalogItem]) -> CatalogSummary {
    let mut by_kind: BTreeMap<CatalogKind, usize> =
        CatalogKind::ALL.into_iter().map(|key| (key, 0)).collect();
    let mut by_platform: BTreeMap<CatalogPlatform, usize> = CatalogPlatform::ALL
        .into_iter()
        .map(|key| (key, 0))
        .collect();
    let mut by_scope: BTreeMap<CatalogScope, usize> =
        CatalogScope::ALL.into_iter().map(|key| (key, 0)).collect();
    let mut projects = BTreeSet::new();
    for item in items {
        *by_kind.entry(item.kind).or_default() += 1;
        *by_platform.entry(item.platform).or_default() += 1;
        *by_scope.entry(item.scope).or_default() += 1;
        if let Some(project) = &item.project_name {
            projects.insert(project.clone());
        }
    }
    CatalogSummary {
        total: items.len(),
        by_kind,
        by_platform,
        by_scope,
        project_names: projects.into_iter().collect(),
    }
}

pub(crate) fn item_order(left: &CatalogItem, right: &CatalogItem) -> std::cmp::Ordering {
    left.name
        .to_lowercase()
        .cmp(&right.name.to_lowercase())
        .then_with(|| left.kind.cmp(&right.kind))
        .then_with(|| left.platform.cmp(&right.platform))
        .then_with(|| left.item_id.cmp(&right.item_id))
}

fn fallback_name(relative: &Path, kind: CatalogKind) -> String {
    if kind == CatalogKind::Skill {
        relative
            .parent()
            .and_then(Path::file_name)
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "skill".to_string())
    } else {
        relative
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| kind.label().to_string())
    }
}

fn slugify(name: &str, fallback: &str) -> String {
    let slug = name
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        fallback.to_lowercase()
    } else {
        slug
    }
}

fn wire_path(path: &Path) -> String {
    path.components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn stable_id(value: &str) -> String {
    // Fixed FNV-1a parameters keep IDs deterministic across processes and Rust versions.
    let mut hash = 0xcbf29ce484222325u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
}

fn system_time(value: std::time::SystemTime) -> String {
    DateTime::<Utc>::from(value).to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn test_grant() -> RootGrant {
        RootGrant {
            grant_id: "test-root".into(),
            display_name: "Test root".into(),
            persisted: false,
        }
    }

    #[test]
    fn classifies_supported_shapes() {
        let skill = classify(Path::new(".codex/skills/release/SKILL.md")).unwrap();
        assert_eq!(skill.kind, CatalogKind::Skill);
        assert_eq!(skill.platform, CatalogPlatform::Codex);
        assert_eq!(skill.config_index, 0);

        let rule = classify(Path::new("project/.cursor/rules/safe.mdc")).unwrap();
        assert_eq!(rule.kind, CatalogKind::Rule);
        assert_eq!(rule.config_index, 1);

        let context = classify(Path::new("project/AGENTS.md")).unwrap();
        assert_eq!(context.kind, CatalogKind::Context);
        assert_eq!(context.platform, CatalogPlatform::Shared);
    }

    #[test]
    fn scans_exact_positive_and_negative_path_matrix() {
        let temp = tempfile::tempdir().unwrap();
        let positives = [
            (".cursor/skills/cursor-skill/SKILL.md", "cursor-skill"),
            (".cursor/skills-cursor/builtin/SKILL.md", "cursor-builtin"),
            (".cursor/agents/cursor-agent.md", "cursor-agent"),
            (".cursor/rules/cursor-rule.mdc", "cursor-rule"),
            (".claude/skills/claude-skill/SKILL.md", "claude-skill"),
            (".claude/agents/claude-agent.md", "claude-agent"),
            (".codex/skills/codex-skill/SKILL.md", "codex-skill"),
            (".codex/agents/codex-agent.md", "codex-agent"),
            (".codex/rules/codex-rule.mdc", "codex-rule"),
            (".agents/skills/shared-skill/SKILL.md", "shared-skill"),
            ("CLAUDE.md", "global-claude-context"),
            ("AGENTS.md", "global-shared-context"),
        ];
        for (path, name) in positives {
            write(temp.path(), path, &format!("---\nname: {name}\n---"));
            write(
                temp.path(),
                &format!("workspace/deep-project/{path}"),
                &format!("---\nname: project-{name}\n---"),
            );
        }
        let negatives = [
            ".cursor/rules/reject-md.md",
            ".codex/rules/reject-md.md",
            ".claude/rules/reject.mdc",
            ".claude/rules/reject.md",
            ".agents/agents/reject.md",
            ".agents/rules/reject.mdc",
            ".agents/plugins/cache/hash/plugin/skills/reject/SKILL.md",
            ".claude/skills-cursor/reject/SKILL.md",
            ".codex/skills-cursor/reject/SKILL.md",
            ".cursor/agents/nested/reject.md",
            ".claude/agents/nested/reject.md",
            ".codex/agents/nested/reject.md",
            ".cursor/rules/nested/reject.mdc",
            ".codex/rules/nested/reject.mdc",
        ];
        for (index, path) in negatives.iter().enumerate() {
            write(
                temp.path(),
                path,
                &format!("---\nname: reject-{index}\n---"),
            );
        }

        let snapshot = scan_root(temp.path(), test_grant()).unwrap();
        assert_eq!(snapshot.items.len(), positives.len() * 2);
        assert!(snapshot
            .items
            .iter()
            .all(|item| !item.name.starts_with("reject-")));
        for (_, name) in positives {
            assert!(snapshot.items.iter().any(|item| item.name == name));
            assert!(snapshot
                .items
                .iter()
                .any(|item| item.name == format!("project-{name}")));
        }
        assert!(snapshot
            .items
            .iter()
            .filter(|item| item.scope == CatalogScope::Project)
            .all(|item| item.project_name.as_deref() == Some("deep-project")));
    }

    #[test]
    fn skips_complete_agentdex_noise_table_and_retains_source_pkg() {
        let temp = tempfile::tempdir().unwrap();
        let noise = [
            "node_modules",
            "bower_components",
            ".pnpm-store",
            ".yarn",
            ".turbo",
            ".parcel-cache",
            ".nuxt",
            ".output",
            ".svelte-kit",
            ".angular",
            ".docusaurus",
            ".vite",
            ".astro",
            "jspm_packages",
            "web_modules",
            ".npm",
            ".sass-cache",
            ".nyc_output",
            "target",
            ".cargo",
            ".rustup",
            ".venv",
            "venv",
            "site-packages",
            "__pycache__",
            ".tox",
            ".mypy_cache",
            ".pytest_cache",
            ".ruff_cache",
            ".eggs",
            "__pypackages__",
            ".nox",
            ".ipynb_checkpoints",
            ".hatch",
            ".pdm-build",
            ".bundle",
            ".dart_tool",
            "_build",
            "deps",
            ".stack-work",
            "dist-newstyle",
            ".gradle",
            ".m2",
            "Pods",
            ".swiftpm",
            "DerivedData",
            "Carthage",
            ".terraform",
            ".terragrunt-cache",
            ".serverless",
            ".vscode",
            ".idea",
            ".vs",
            ".fleet",
            ".history",
            ".svn",
            ".hg",
            "$RECYCLE.BIN",
            "System Volume Information",
            "Library",
            ".Trash",
            "dist",
            ".git",
            "build",
            ".next",
            "vendor",
            "coverage",
            "cache",
            ".cache",
            "Caches",
        ];
        for (index, directory) in noise.iter().enumerate() {
            write(
                temp.path(),
                &format!("{directory}/project-{index}/.codex/skills/noise/SKILL.md"),
                "---\nname: Noise\n---",
            );
        }
        write(
            temp.path(),
            "go/pkg/project/.codex/skills/noise/SKILL.md",
            "---\nname: Go cache noise\n---",
        );
        write(
            temp.path(),
            "source/pkg/.codex/skills/kept/SKILL.md",
            "---\nname: Kept source pkg\n---",
        );

        let snapshot = scan_root(temp.path(), test_grant()).unwrap();
        assert_eq!(snapshot.items.len(), 1);
        assert_eq!(snapshot.items[0].name, "Kept source pkg");
    }

    #[cfg(unix)]
    #[test]
    fn canonical_dedup_attaches_sorted_aliases_and_skips_unsafe_links() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            ".codex/skills/canonical/SKILL.md",
            "---\nname: Canonical\n---",
        );
        write(outside.path(), "SKILL.md", "---\nname: Outside\n---");
        symlink(
            temp.path().join(".codex/skills/canonical"),
            temp.path().join(".codex/skills/z-alias"),
        )
        .unwrap();
        symlink(
            temp.path().join(".codex/skills/canonical"),
            temp.path().join(".codex/skills/a-alias"),
        )
        .unwrap();
        symlink(outside.path(), temp.path().join(".codex/skills/outside")).unwrap();
        symlink("missing", temp.path().join(".codex/skills/broken")).unwrap();
        symlink("loop", temp.path().join(".codex/skills/loop")).unwrap();

        let snapshot = scan_root(temp.path(), test_grant()).unwrap();
        assert_eq!(snapshot.items.len(), 1);
        assert_eq!(
            snapshot.items[0]
                .aliases
                .iter()
                .map(|alias| alias.display_path.as_str())
                .collect::<Vec<_>>(),
            vec![
                ".codex/skills/a-alias/SKILL.md",
                ".codex/skills/z-alias/SKILL.md"
            ]
        );
        assert!(snapshot.skipped_unreadable >= 3);
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("Outside"));
    }

    #[cfg(windows)]
    #[test]
    fn directory_reparse_alias_is_deduplicated_and_outside_link_is_skipped() {
        use std::os::windows::fs::symlink_dir;

        fn directory_link(link: &Path, target: &Path) {
            symlink_dir(target, link).unwrap_or_else(|error| {
                panic!("Windows directory reparse link creation failed: {error}")
            });
        }

        let temp = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            ".codex/skills/canonical/SKILL.md",
            "---\nname: Canonical\n---",
        );
        write(outside.path(), "SKILL.md", "---\nname: Outside\n---");
        directory_link(
            &temp.path().join(".codex/skills/z-alias"),
            &temp.path().join(".codex/skills/canonical"),
        );
        directory_link(
            &temp.path().join(".codex/skills/a-alias"),
            &temp.path().join(".codex/skills/canonical"),
        );
        directory_link(&temp.path().join(".codex/skills/outside"), outside.path());
        directory_link(
            &temp.path().join(".codex/skills/broken"),
            &temp.path().join(".codex/skills/missing"),
        );
        let loop_path = temp.path().join(".codex/skills/loop");
        directory_link(&loop_path, &loop_path);

        let snapshot = scan_root(temp.path(), test_grant()).unwrap();
        assert_eq!(snapshot.items.len(), 1);
        assert_eq!(
            snapshot.items[0]
                .aliases
                .iter()
                .map(|alias| alias.display_path.as_str())
                .collect::<Vec<_>>(),
            vec![
                ".codex/skills/a-alias/SKILL.md",
                ".codex/skills/z-alias/SKILL.md"
            ]
        );
        assert!(snapshot.skipped_unreadable >= 3);
        assert!(!serde_json::to_string(&snapshot)
            .unwrap()
            .contains("Outside"));
    }

    #[test]
    #[ignore = "manual deterministic 10k-item scanner benchmark"]
    fn perf_scan_10k_fixture() {
        let temp = tempfile::tempdir().unwrap();
        let agents = temp.path().join(".codex/agents");
        fs::create_dir_all(&agents).unwrap();
        for index in 0..10_000 {
            fs::write(
                agents.join(format!("agent-{index:05}.md")),
                format!("---\nname: Agent {index:05}\ndescription: Fixture agent\n---"),
            )
            .unwrap();
        }
        let started = std::time::Instant::now();
        let snapshot = scan_root(temp.path(), test_grant()).unwrap();
        let elapsed = started.elapsed();
        eprintln!(
            "skillgate-catalog 10k fixture: {} items in {:.3}s",
            snapshot.items.len(),
            elapsed.as_secs_f64()
        );
        assert_eq!(snapshot.items.len(), 10_000);
    }

    #[test]
    fn plugin_layouts_resolve_a_human_name() {
        let hashed = vec![
            "plugins".into(),
            "cache".into(),
            "hash".into(),
            "notion".into(),
            "skills".into(),
        ];
        let direct = vec![
            "plugins".into(),
            "cache".into(),
            "notion".into(),
            "skills".into(),
        ];
        assert_eq!(plugin_name(&hashed).as_deref(), Some("notion"));
        assert_eq!(plugin_name(&direct).as_deref(), Some("notion"));
    }

    #[test]
    fn stable_ids_are_repeatable() {
        assert_eq!(stable_id("same"), stable_id("same"));
        assert_ne!(stable_id("same"), stable_id("different"));
    }

    #[test]
    fn outside_native_path_is_rejected_before_catalog_insertion() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let outside_file = outside.path().join("outside.md");
        fs::write(
            &outside_file,
            "---\nname: must-never-serialize\ndescription: outside-secret\n---",
        )
        .unwrap();
        let canonical_root = fs::canonicalize(root.path()).unwrap();
        let mut builder = SnapshotBuilder::new(&canonical_root, test_grant());
        let relative = Path::new(".codex/agents/outside.md");
        let error = builder
            .add_item(&outside_file, relative, classify(relative).unwrap(), None)
            .unwrap_err();
        assert_eq!(error.code, AppErrorCode::SymlinkEscape);
        assert!(builder.items.is_empty());
        assert!(builder.content_digests.is_empty());
    }

    #[test]
    fn revision_changes_for_content_change_with_restored_mtime() {
        let temp = tempfile::tempdir().unwrap();
        let relative = ".codex/agents/digest.md";
        let path = temp.path().join(relative);
        write(temp.path(), relative, "# Digest\n\nalpha");
        let original_modified = fs::metadata(&path).unwrap().modified().unwrap();
        let before = scan_root(temp.path(), test_grant()).unwrap();

        // Equal-length content plus an explicitly restored mtime proves the
        // revision is backed by content, not timestamp or size alone.
        fs::write(&path, "# Digest\n\nbravo").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(&path)
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(original_modified))
            .unwrap();
        assert_eq!(
            fs::metadata(&path).unwrap().modified().unwrap(),
            original_modified
        );

        let after = scan_root(temp.path(), test_grant()).unwrap();
        assert_ne!(before.revision, after.revision);
        assert_eq!(before.items[0].modified_at, after.items[0].modified_at);
    }
}
