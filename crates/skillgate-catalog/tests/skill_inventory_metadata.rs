use skillgate_catalog::{
    CatalogFilter, CatalogInstallationLevel, CatalogKind, CatalogPlatform, CatalogRiskLevel,
    CatalogRiskSignal, CatalogService, CatalogSourceKind, CatalogUsageStatus, GrantRegistry,
    ListCatalogInput,
};
use std::fs;
use std::path::Path;

fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
}

#[cfg(unix)]
fn directory_link(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(windows)]
fn directory_link(target: &Path, link: &Path) {
    std::os::windows::fs::symlink_dir(target, link).unwrap();
}

#[test]
fn home_scan_enriches_skill_inventory_facts_without_guessing_usage() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".claude/skills/global/SKILL.md",
        "---\nname: Claude global\nrepository: https://github.com/example/skills\n---\nUse sudo only after review.",
    );
    write(
        temp.path(),
        ".agents/skills/shared/SKILL.md",
        "---\nname: Shared skill\n---\nShared instructions.",
    );
    write(
        temp.path(),
        "workspace/.codex/skills/project/SKILL.md",
        "---\nname: Project skill\n---\nProject instructions.",
    );
    write(
        temp.path(),
        ".codex/plugins/cache/openai-bundled/demo/1.0.0/skills/plugin/SKILL.md",
        "---\nname: Plugin skill\nrepository: https://example.invalid/ignored\n---\nNever run rm -rf without a backup.",
    );

    let grants = GrantRegistry::new();
    grants
        .register_host_root("home", temp.path(), "Home", true)
        .unwrap();
    let service = CatalogService::new(grants);
    let snapshot = service.scan("home").unwrap();

    let claude = snapshot
        .items
        .iter()
        .find(|item| item.name == "Claude global")
        .unwrap()
        .skill_meta
        .as_ref()
        .unwrap();
    assert_eq!(claude.compatible_with, vec![CatalogPlatform::Claude]);
    assert_eq!(claude.installation_level, CatalogInstallationLevel::Global);
    assert_eq!(claude.source_kind, CatalogSourceKind::Manifest);
    assert_eq!(claude.source_label, "https://github.com/example/skills");
    assert_eq!(claude.usage_status, CatalogUsageStatus::Untracked);
    assert_eq!(claude.usage_count, None);
    assert_eq!(claude.last_used_at, None);
    assert_eq!(claude.risk_level, CatalogRiskLevel::Medium);
    assert_eq!(
        claude.risk_signals,
        vec![CatalogRiskSignal::ElevatedPrivileges]
    );

    let shared = snapshot
        .items
        .iter()
        .find(|item| item.name == "Shared skill")
        .unwrap()
        .skill_meta
        .as_ref()
        .unwrap();
    assert_eq!(
        shared.compatible_with,
        vec![
            CatalogPlatform::Claude,
            CatalogPlatform::Codex,
            CatalogPlatform::Cursor
        ]
    );

    let project = snapshot
        .items
        .iter()
        .find(|item| item.name == "Project skill")
        .unwrap()
        .skill_meta
        .as_ref()
        .unwrap();
    assert_eq!(
        project.installation_level,
        CatalogInstallationLevel::Project
    );

    let plugin = snapshot
        .items
        .iter()
        .find(|item| item.name == "Plugin skill")
        .unwrap()
        .skill_meta
        .as_ref()
        .unwrap();
    assert_eq!(plugin.installation_level, CatalogInstallationLevel::Plugin);
    assert_eq!(plugin.source_kind, CatalogSourceKind::Plugin);
    assert_eq!(plugin.source_label, "openai-bundled");
    assert_eq!(plugin.risk_level, CatalogRiskLevel::High);
    assert_eq!(
        plugin.risk_signals,
        vec![CatalogRiskSignal::DestructiveCommand]
    );

    assert_eq!(
        snapshot.summary.by_installation_level[&CatalogInstallationLevel::Global],
        2
    );
    assert_eq!(
        snapshot.summary.by_installation_level[&CatalogInstallationLevel::Project],
        1
    );
    assert_eq!(
        snapshot.summary.by_installation_level[&CatalogInstallationLevel::Plugin],
        1
    );
    assert_eq!(snapshot.summary.by_risk_level[&CatalogRiskLevel::High], 1);

    let wire = serde_json::to_value(snapshot).unwrap();
    assert_eq!(wire["items"][0]["skillMeta"]["usageStatus"], "untracked");
    assert!(wire["summary"]["byInstallationLevel"].is_object());

    for query in [
        "Claude Code",
        "Declared source",
        "Elevated privileges",
        "Usage not tracked",
    ] {
        let matches = service
            .search(&ListCatalogInput {
                grant_id: "home".to_string(),
                filter: Some(CatalogFilter {
                    query: Some(query.to_string()),
                    kinds: Some(vec![CatalogKind::Skill]),
                    ..CatalogFilter::default()
                }),
                offset: None,
                limit: None,
            })
            .unwrap();
        assert!(
            matches
                .items
                .iter()
                .any(|item| item.name == "Claude global"),
            "human-readable query did not match the displayed metadata: {query}"
        );
    }

    let high_signal_matches = service
        .search(&ListCatalogInput {
            grant_id: "home".to_string(),
            filter: Some(CatalogFilter {
                query: Some("High-severity signals".to_string()),
                kinds: Some(vec![CatalogKind::Skill]),
                ..CatalogFilter::default()
            }),
            offset: None,
            limit: None,
        })
        .unwrap();
    assert!(high_signal_matches
        .items
        .iter()
        .any(|item| item.name == "Plugin skill"));
}

#[test]
fn picker_marks_non_plugin_skills_as_external() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".codex/skills/picked/SKILL.md",
        "---\nname: Picked skill\n---",
    );
    write(
        temp.path(),
        ".claude/skills/plugin-alias/SKILL.md",
        "---\nname: Plugin alias\nrepository: https://example.invalid/declared\n---",
    );
    fs::create_dir_all(
        temp.path()
            .join(".codex/plugins/cache/vendor/demo/1.0.0/skills"),
    )
    .unwrap();
    directory_link(
        &temp.path().join(".claude/skills/plugin-alias"),
        &temp
            .path()
            .join(".codex/plugins/cache/vendor/demo/1.0.0/skills/plugin-alias"),
    );
    let grants = GrantRegistry::new();
    grants
        .register_host_root("picker", temp.path(), "Selected folder", false)
        .unwrap();
    let snapshot = CatalogService::new(grants).scan("picker").unwrap();
    let metadata = snapshot
        .items
        .iter()
        .find(|item| item.name == "Picked skill")
        .unwrap()
        .skill_meta
        .as_ref()
        .unwrap();
    assert_eq!(
        metadata.installation_level,
        CatalogInstallationLevel::External
    );
    assert_eq!(metadata.source_kind, CatalogSourceKind::External);
    assert_eq!(metadata.source_label, "Selected folder");

    let plugin = snapshot
        .items
        .iter()
        .find(|item| item.name == "Plugin alias")
        .unwrap()
        .skill_meta
        .as_ref()
        .unwrap();
    assert_eq!(plugin.installation_level, CatalogInstallationLevel::Plugin);
    assert_eq!(plugin.source_kind, CatalogSourceKind::Plugin);
    assert_eq!(plugin.source_label, "vendor");
}

#[test]
fn shared_and_cross_tool_aliases_drive_compatible_platform_search_and_filters() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".claude/skills/dual/SKILL.md",
        "---\nname: Dual install\n---\nOne canonical skill.",
    );
    write(
        temp.path(),
        ".agents/skills/shared/SKILL.md",
        "---\nname: Portable adapter\n---\nCross-tool skill.",
    );
    write(
        temp.path(),
        ".claude/agents/claude-only.md",
        "---\nname: Claude-only agent\n---",
    );
    write(
        temp.path(),
        ".codex/agents/codex-only.md",
        "---\nname: Codex-only agent\n---",
    );
    fs::create_dir_all(temp.path().join(".codex/skills")).unwrap();
    directory_link(
        &temp.path().join(".claude/skills/dual"),
        &temp.path().join(".codex/skills/dual"),
    );
    fs::create_dir_all(
        temp.path()
            .join(".codex/plugins/cache/vendor/dual-plugin/1.0.0/skills"),
    )
    .unwrap();
    directory_link(
        &temp.path().join(".claude/skills/dual"),
        &temp
            .path()
            .join(".codex/plugins/cache/vendor/dual-plugin/1.0.0/skills/dual"),
    );

    let grants = GrantRegistry::new();
    grants
        .register_host_root("home", temp.path(), "Home", true)
        .unwrap();
    let service = CatalogService::new(grants);
    let snapshot = service.scan("home").unwrap();

    let dual = snapshot
        .items
        .iter()
        .find(|item| item.name == "Dual install")
        .unwrap();
    let dual_metadata = dual.skill_meta.as_ref().unwrap();
    assert_eq!(
        dual_metadata.compatible_with,
        vec![CatalogPlatform::Claude, CatalogPlatform::Codex]
    );
    assert_eq!(dual_metadata.installation_count, 3);
    assert_eq!(
        dual_metadata.installation_level,
        CatalogInstallationLevel::Plugin
    );
    assert_eq!(dual_metadata.source_kind, CatalogSourceKind::Plugin);
    assert_eq!(dual_metadata.source_label, "vendor");
    assert_eq!(dual.aliases.len(), 2);

    let codex_filter = CatalogFilter {
        platforms: Some(vec![CatalogPlatform::Codex]),
        ..CatalogFilter::default()
    };
    let codex_items = service
        .list(&ListCatalogInput {
            grant_id: "home".to_string(),
            filter: Some(codex_filter),
            offset: None,
            limit: None,
        })
        .unwrap()
        .items;
    assert!(codex_items.iter().any(|item| item.name == "Dual install"));
    assert!(codex_items
        .iter()
        .any(|item| item.name == "Portable adapter"));
    assert!(codex_items
        .iter()
        .any(|item| item.name == "Codex-only agent" && item.kind == CatalogKind::Agent));
    assert!(!codex_items
        .iter()
        .any(|item| item.name == "Claude-only agent"));

    let compatible_search = service
        .search(&ListCatalogInput {
            grant_id: "home".to_string(),
            filter: Some(CatalogFilter {
                query: Some("codex".to_string()),
                kinds: Some(vec![CatalogKind::Skill]),
                ..CatalogFilter::default()
            }),
            offset: None,
            limit: None,
        })
        .unwrap();
    assert!(compatible_search
        .items
        .iter()
        .any(|item| item.name == "Dual install"));
    assert!(compatible_search
        .items
        .iter()
        .any(|item| item.name == "Portable adapter"));

    let shared_items = service
        .list(&ListCatalogInput {
            grant_id: "home".to_string(),
            filter: Some(CatalogFilter {
                platforms: Some(vec![CatalogPlatform::Shared]),
                kinds: Some(vec![CatalogKind::Skill]),
                ..CatalogFilter::default()
            }),
            offset: None,
            limit: None,
        })
        .unwrap();
    assert_eq!(shared_items.items.len(), 1);
    assert_eq!(shared_items.items[0].name, "Portable adapter");

    let shared_search = service
        .search(&ListCatalogInput {
            grant_id: "home".to_string(),
            filter: Some(CatalogFilter {
                query: Some("shared".to_string()),
                kinds: Some(vec![CatalogKind::Skill]),
                ..CatalogFilter::default()
            }),
            offset: None,
            limit: None,
        })
        .unwrap();
    assert_eq!(shared_search.items.len(), 1);
    assert_eq!(shared_search.items[0].name, "Portable adapter");

    let wire = serde_json::to_value(dual).unwrap();
    assert_eq!(
        wire["skillMeta"]["compatibleWith"],
        serde_json::json!(["claude", "codex"])
    );
}
