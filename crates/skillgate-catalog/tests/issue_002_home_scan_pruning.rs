// Regression: ISSUE-002 — Home scans must skip AppData without weakening explicit grants.
// Found by /qa on 2026-07-15
// Report: .gstack/qa-reports/qa-report-127-0-0-1-2026-07-15.md

use skillgate_catalog::{CatalogService, GrantRegistry};
use std::fs;
use std::path::Path;

fn write(root: &Path, relative: &str, name: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, format!("---\nname: {name}\n---\n")).unwrap();
}

#[test]
fn home_prunes_appdata_but_picker_keeps_explicitly_granted_content() {
    let temp = tempfile::tempdir().unwrap();
    write(
        temp.path(),
        "AppData/Local/tool/.codex/skills/noise/SKILL.md",
        "AppData skill",
    );
    write(temp.path(), ".codex/skills/global/SKILL.md", "Global skill");
    write(
        temp.path(),
        "Documents/project/.codex/skills/project/SKILL.md",
        "Project skill",
    );

    let grants = GrantRegistry::new();
    grants
        .register_host_root("home", temp.path(), "Home", true)
        .unwrap();
    grants
        .register_host_root(
            "picker-appdata",
            temp.path().join("AppData"),
            "AppData",
            false,
        )
        .unwrap();
    let service = CatalogService::new(grants);

    let home = service.scan("home").unwrap();
    let home_names = home
        .items
        .iter()
        .map(|item| item.name.as_str())
        .collect::<Vec<_>>();
    assert_eq!(home_names, vec!["Global skill", "Project skill"]);

    let picker = service.scan("picker-appdata").unwrap();
    assert_eq!(picker.items.len(), 1);
    assert_eq!(picker.items[0].name, "AppData skill");
}
