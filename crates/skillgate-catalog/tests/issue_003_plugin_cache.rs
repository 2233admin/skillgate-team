// Regression: ISSUE-003 — canonical plugin caches must be scanned without reopening arbitrary cache trees.
// Found by /qa on 2026-07-15
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-07-15.md

use skillgate_catalog::{CatalogKind, CatalogPlatform, CatalogService, GrantRegistry};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

fn write(root: &Path, relative: &str, name: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, format!("---\nname: {name}\n---\n")).unwrap();
}

#[cfg(unix)]
fn directory_link(link: &Path, target: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(windows)]
fn directory_link(link: &Path, target: &Path) {
    std::os::windows::fs::symlink_dir(target, link).unwrap();
}

#[test]
fn home_scans_canonical_plugin_skills_without_reopening_noise_caches() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".claude/plugins/cache/vendor/test-plugin/1.0.0/deep/nested/skills/example/more/SKILL.md",
        "Plugin skill",
    );
    write(
        temp.path(),
        ".codex/plugins/cache/direct-plugin/2.4.0/skills/direct/SKILL.md",
        "Direct plugin skill",
    );
    write(
        temp.path(),
        ".claude/skills/direct/SKILL.md",
        "Direct skill",
    );
    write(temp.path(), ".codex/agents/reviewer.md", "Reviewer agent");
    write(temp.path(), ".codex/rules/project.mdc", "Project rule");
    write(
        temp.path(),
        "Documents/project/.codex/skills/project/SKILL.md",
        "Project skill",
    );
    write(
        temp.path(),
        "Documents/project/cache/.codex/skills/noise/SKILL.md",
        "Noise skill",
    );
    write(
        temp.path(),
        ".projects/hidden/.codex/skills/hidden/SKILL.md",
        "Hidden project skill",
    );

    let grants = GrantRegistry::new();
    grants
        .register_host_root("home", temp.path(), "Home", true)
        .unwrap();
    let snapshot = CatalogService::new(grants).scan("home").unwrap();
    let items = snapshot
        .items
        .iter()
        .map(|item| (item.name.as_str(), item))
        .collect::<BTreeMap<_, _>>();

    let plugin = items.get("Plugin skill").unwrap();
    assert_eq!(plugin.kind, CatalogKind::Skill);
    assert_eq!(plugin.platform, CatalogPlatform::Claude);
    assert_eq!(plugin.plugin_name.as_deref(), Some("test-plugin"));
    assert_eq!(plugin.group_label, "Plugin · test-plugin");

    let direct_plugin = items.get("Direct plugin skill").unwrap();
    assert_eq!(direct_plugin.platform, CatalogPlatform::Codex);
    assert_eq!(direct_plugin.plugin_name.as_deref(), Some("direct-plugin"));

    assert_eq!(items.get("Direct skill").unwrap().kind, CatalogKind::Skill);
    assert_eq!(
        items.get("Reviewer agent").unwrap().kind,
        CatalogKind::Agent
    );
    assert_eq!(items.get("Project rule").unwrap().kind, CatalogKind::Rule);
    assert_eq!(items.get("Project skill").unwrap().kind, CatalogKind::Skill);
    assert_eq!(
        items.get("Hidden project skill").unwrap().kind,
        CatalogKind::Skill
    );
    assert!(!items.contains_key("Noise skill"));
}

#[test]
fn picker_preserves_recursive_context_and_plugin_cache_discovery() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        ".codex/docs/AGENTS.md",
        "Nested picker context",
    );
    write(
        temp.path(),
        ".codex/plugins/cache/vendor/picker-plugin/1.0.0/docs/skills/deep/SKILL.md",
        "Picker plugin skill",
    );

    let grants = GrantRegistry::new();
    grants
        .register_host_root("picker", temp.path(), "Picker", false)
        .unwrap();
    let snapshot = CatalogService::new(grants).scan("picker").unwrap();
    let names = snapshot
        .items
        .iter()
        .map(|item| item.name.as_str())
        .collect::<Vec<_>>();

    assert!(names.contains(&"Nested picker context"));
    assert!(names.contains(&"Picker plugin skill"));
}

#[test]
fn home_preserves_plugin_cache_directory_aliases() {
    let temp = tempfile::tempdir().unwrap();
    let canonical = temp
        .path()
        .join(".claude/plugins/cache/vendor/link-plugin/1.0.0/skills/canonical");
    write(
        temp.path(),
        ".claude/plugins/cache/vendor/link-plugin/1.0.0/skills/canonical/SKILL.md",
        "Linked plugin skill",
    );
    directory_link(
        &temp
            .path()
            .join(".claude/plugins/cache/vendor/link-plugin/1.0.0/skills/alias"),
        &canonical,
    );

    let grants = GrantRegistry::new();
    grants
        .register_host_root("home", temp.path(), "Home", true)
        .unwrap();
    let snapshot = CatalogService::new(grants).scan("home").unwrap();

    assert_eq!(snapshot.items.len(), 1);
    assert_eq!(snapshot.items[0].name, "Linked plugin skill");
    assert_eq!(snapshot.items[0].aliases.len(), 1);
    assert_eq!(
        snapshot.items[0].aliases[0].display_path,
        ".claude/plugins/cache/vendor/link-plugin/1.0.0/skills/alias/SKILL.md"
    );
}
