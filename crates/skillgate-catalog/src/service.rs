use crate::error::{AppError, AppErrorCategory, AppErrorCode, AppResult};
use crate::grant::GrantRegistry;
use crate::model::{
    CatalogFilter, CatalogItem, CatalogSnapshot, ListCatalogInput, ListCatalogOutput,
};
use crate::scanner::{groups_for, item_order, scan_root, summary_for};
use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone)]
pub struct CatalogService {
    grants: GrantRegistry,
    snapshots: Arc<RwLock<BTreeMap<String, CatalogSnapshot>>>,
}

impl CatalogService {
    pub fn new(grants: GrantRegistry) -> Self {
        Self {
            grants,
            snapshots: Arc::new(RwLock::new(BTreeMap::new())),
        }
    }

    pub fn grants(&self) -> &GrantRegistry {
        &self.grants
    }

    /// Performs a fresh read-only scan. `force` belongs to the host cache policy;
    /// this method always returns a snapshot of current disk state.
    pub fn scan(&self, grant_id: &str) -> AppResult<CatalogSnapshot> {
        self.scan_with_policy(grant_id, true)
    }

    /// Returns the cached snapshot when `force` is false and one exists;
    /// otherwise performs and stores a fresh read-only traversal.
    pub fn scan_with_policy(&self, grant_id: &str, force: bool) -> AppResult<CatalogSnapshot> {
        self.grants.get(grant_id)?;
        if !force {
            if let Some(snapshot) = self
                .snapshots
                .read()
                .map_err(|_| cache_error())?
                .get(grant_id)
                .cloned()
            {
                return Ok(snapshot);
            }
        }
        let grant = self.grants.get(grant_id)?;
        let root = self.grants.resolve_root_path(grant_id)?;
        let snapshot = scan_root(&root, grant)?;
        self.snapshots
            .write()
            .map_err(|_| cache_error())?
            .insert(grant_id.to_string(), snapshot.clone());
        Ok(snapshot)
    }

    pub fn list(&self, input: &ListCatalogInput) -> AppResult<ListCatalogOutput> {
        self.list_filtered(input, false)
    }

    pub fn search(&self, input: &ListCatalogInput) -> AppResult<ListCatalogOutput> {
        self.list_filtered(input, true)
    }

    pub fn get_item(&self, grant_id: &str, item_id: &str) -> AppResult<CatalogItem> {
        self.snapshot(grant_id)?
            .items
            .into_iter()
            .find(|item| item.item_id == item_id)
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::NotFound,
                    AppErrorCategory::NotFound,
                    "catalog item was not found",
                )
            })
    }

    fn list_filtered(
        &self,
        input: &ListCatalogInput,
        require_query: bool,
    ) -> AppResult<ListCatalogOutput> {
        let snapshot = self.snapshot(&input.grant_id)?;
        let filter = input.filter.clone().unwrap_or_default();
        if require_query && filter.query.as_deref().unwrap_or("").trim().is_empty() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "catalog search requires a non-empty query",
            ));
        }
        let mut matched: Vec<_> = snapshot
            .items
            .into_iter()
            .filter(|item| matches_filter(item, &filter))
            .collect();
        matched.sort_by(item_order);
        let total_matched = matched.len();
        let summary = summary_for(&matched);
        let offset = input.offset.unwrap_or(0).min(total_matched);
        let limit = input.limit.unwrap_or(total_matched.saturating_sub(offset));
        let items = matched
            .into_iter()
            .skip(offset)
            .take(limit)
            .collect::<Vec<_>>();
        let groups = groups_for(&items);
        Ok(ListCatalogOutput {
            revision: snapshot.revision,
            groups,
            items,
            summary,
            total_matched,
        })
    }

    fn snapshot(&self, grant_id: &str) -> AppResult<CatalogSnapshot> {
        self.grants.get(grant_id)?;
        self.snapshots
            .read()
            .map_err(|_| cache_error())?
            .get(grant_id)
            .cloned()
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::NotFound,
                    AppErrorCategory::NotFound,
                    "catalog has not been scanned for this grant",
                )
            })
    }
}

fn matches_filter(item: &CatalogItem, filter: &CatalogFilter) -> bool {
    if let Some(query) = filter
        .query
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
    {
        let query = query.to_lowercase();
        let haystack = format!(
            "{} {} {} {} {}",
            item.name,
            item.slug,
            item.description,
            item.creator.as_deref().unwrap_or(""),
            item.display_path
        )
        .to_lowercase();
        if !haystack.contains(&query) {
            return false;
        }
    }
    if filter
        .kinds
        .as_ref()
        .is_some_and(|values| !values.contains(&item.kind))
    {
        return false;
    }
    if filter
        .platforms
        .as_ref()
        .is_some_and(|values| !values.contains(&item.platform))
    {
        return false;
    }
    if filter
        .scopes
        .as_ref()
        .is_some_and(|values| !values.contains(&item.scope))
    {
        return false;
    }
    if filter.project_names.as_ref().is_some_and(|values| {
        item.project_name
            .as_ref()
            .is_none_or(|project| !values.contains(project))
    }) {
        return false;
    }
    if filter
        .group_ids
        .as_ref()
        .is_some_and(|values| !values.contains(&item.group_id))
    {
        return false;
    }
    true
}

fn cache_error() -> AppError {
    AppError::new(
        AppErrorCode::Internal,
        AppErrorCategory::Internal,
        "catalog snapshot cache is unavailable",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{CatalogKind, CatalogPlatform, CatalogScope};
    use std::fs;
    use std::path::Path;

    fn write(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn fixture() -> (tempfile::TempDir, CatalogService) {
        let temp = tempfile::tempdir().unwrap();
        write(
            temp.path(),
            ".codex/skills/release/SKILL.md",
            "---\nname: Release\ndescription: Ship safely\nauthor: Ada\n---",
        );
        write(
            temp.path(),
            ".claude/agents/reviewer.md",
            "---\nname: Reviewer\ndescription: Reviews code\n---",
        );
        write(
            temp.path(),
            ".cursor/rules/safe.mdc",
            "# Safe rule\n\nAvoid surprises.",
        );
        write(
            temp.path(),
            "project/CLAUDE.md",
            "# Project\n\nProject context.",
        );
        write(
            temp.path(),
            "project/.agents/skills/shared/SKILL.md",
            "---\nname: Shared helper\ndescription: Shared project skill\n---",
        );
        write(
            temp.path(),
            "node_modules/pkg/.codex/skills/noise/SKILL.md",
            "---\nname: Noise\n---",
        );
        write(
            temp.path(),
            "work/nested-project/.codex/agents/planner.md",
            "---\nname: Planner\ndescription: Plans work\n---",
        );
        let grants = GrantRegistry::new();
        grants
            .register_host_root("fixture", temp.path(), "Fixture", false)
            .unwrap();
        let service = CatalogService::new(grants);
        (temp, service)
    }

    #[test]
    fn scans_unified_fixture_and_omits_native_paths() {
        let (temp, service) = fixture();
        let snapshot = service.scan("fixture").unwrap();
        assert_eq!(snapshot.items.len(), 6);
        assert_eq!(snapshot.summary.by_kind[&CatalogKind::Skill], 2);
        assert_eq!(snapshot.summary.by_kind[&CatalogKind::Agent], 2);
        assert_eq!(snapshot.summary.by_kind[&CatalogKind::Rule], 1);
        assert_eq!(snapshot.summary.by_kind[&CatalogKind::Context], 1);
        assert_eq!(snapshot.summary.by_scope[&CatalogScope::Global], 3);
        assert_eq!(snapshot.summary.by_scope[&CatalogScope::Project], 3);
        assert!(snapshot
            .items
            .iter()
            .any(|item| item.project_name.as_deref() == Some("nested-project")));
        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(!json.contains(temp.path().to_string_lossy().as_ref()));
        assert!(snapshot
            .items
            .iter()
            .all(|item| !item.location.relative_path.contains("..")));
    }

    #[test]
    fn list_filters_searches_pages_and_sorts_deterministically() {
        let (_temp, service) = fixture();
        let first = service.scan("fixture").unwrap();
        let second = service.scan("fixture").unwrap();
        assert_eq!(first.revision, second.revision);
        assert_eq!(first.items, second.items);

        let output = service
            .search(&ListCatalogInput {
                grant_id: "fixture".into(),
                filter: Some(CatalogFilter {
                    query: Some("project".into()),
                    scopes: Some(vec![CatalogScope::Project]),
                    ..CatalogFilter::default()
                }),
                offset: Some(0),
                limit: Some(1),
            })
            .unwrap();
        assert_eq!(output.total_matched, 3);
        assert_eq!(output.items.len(), 1);

        let codex = service
            .list(&ListCatalogInput {
                grant_id: "fixture".into(),
                filter: Some(CatalogFilter {
                    platforms: Some(vec![CatalogPlatform::Codex]),
                    scopes: Some(vec![CatalogScope::Global]),
                    ..CatalogFilter::default()
                }),
                offset: None,
                limit: None,
            })
            .unwrap();
        assert_eq!(codex.total_matched, 1);
        assert_eq!(codex.items[0].name, "Release");
    }

    #[test]
    fn get_item_is_scoped_to_grant_snapshot() {
        let (_temp, service) = fixture();
        let snapshot = service.scan("fixture").unwrap();
        let item = service
            .get_item("fixture", &snapshot.items[0].item_id)
            .unwrap();
        assert_eq!(item, snapshot.items[0]);
        assert_eq!(
            service.get_item("fixture", "missing").unwrap_err().code,
            AppErrorCode::NotFound
        );
    }

    #[test]
    fn requires_scan_and_non_empty_search_query() {
        let (_temp, service) = fixture();
        let input = ListCatalogInput {
            grant_id: "fixture".into(),
            filter: Some(CatalogFilter::default()),
            offset: None,
            limit: None,
        };
        assert_eq!(
            service.list(&input).unwrap_err().code,
            AppErrorCode::NotFound
        );
        service.scan("fixture").unwrap();
        assert_eq!(
            service.search(&input).unwrap_err().code,
            AppErrorCode::InvalidArgument
        );
    }

    #[test]
    fn scan_policy_uses_cache_unless_forced() {
        let (temp, service) = fixture();
        let before = service.scan_with_policy("fixture", true).unwrap();
        write(
            temp.path(),
            ".codex/agents/after-cache.md",
            "---\nname: After cache\n---",
        );

        let warm = service.scan_with_policy("fixture", false).unwrap();
        assert_eq!(warm, before);
        let refreshed = service.scan_with_policy("fixture", true).unwrap();
        assert_ne!(refreshed.revision, before.revision);
        assert_eq!(refreshed.items.len(), before.items.len() + 1);
    }

    #[test]
    #[ignore = "manual deterministic 10k cold-force/warm-cache benchmark"]
    fn perf_scan_policy_10k_fixture() {
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
        let grants = GrantRegistry::new();
        grants
            .register_host_root("perf", temp.path(), "Performance fixture", false)
            .unwrap();
        let service = CatalogService::new(grants);

        let cold_started = std::time::Instant::now();
        let cold = service.scan_with_policy("perf", true).unwrap();
        let cold_elapsed = cold_started.elapsed();
        let warm_started = std::time::Instant::now();
        let warm = service.scan_with_policy("perf", false).unwrap();
        let warm_elapsed = warm_started.elapsed();
        eprintln!(
            "skillgate-catalog 10k policy: {} items, cold(force=true) {:.3}s, warm(force=false) {:.6}s",
            cold.items.len(),
            cold_elapsed.as_secs_f64(),
            warm_elapsed.as_secs_f64()
        );
        assert_eq!(cold.items.len(), 10_000);
        assert_eq!(warm, cold);
    }
}
