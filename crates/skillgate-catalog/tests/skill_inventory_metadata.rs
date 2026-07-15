use skillgate_catalog::{
    CatalogInstallationLevel, CatalogPlatform, CatalogRiskLevel, CatalogRiskSignal, CatalogService,
    CatalogSourceKind, CatalogUsageStatus, GrantRegistry,
};
use std::fs;
use std::path::Path;

fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, content).unwrap();
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
    let snapshot = CatalogService::new(grants).scan("home").unwrap();

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
}

#[test]
fn picker_marks_non_plugin_skills_as_external() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".codex/skills/picked/SKILL.md",
        "---\nname: Picked skill\n---",
    );
    let grants = GrantRegistry::new();
    grants
        .register_host_root("picker", temp.path(), "Selected folder", false)
        .unwrap();
    let snapshot = CatalogService::new(grants).scan("picker").unwrap();
    let metadata = snapshot.items[0].skill_meta.as_ref().unwrap();
    assert_eq!(
        metadata.installation_level,
        CatalogInstallationLevel::External
    );
    assert_eq!(metadata.source_kind, CatalogSourceKind::External);
    assert_eq!(metadata.source_label, "Selected folder");
}
