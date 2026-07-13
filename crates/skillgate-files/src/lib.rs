//! Capability-scoped filesystem core for Skillgate Desktop.

mod model;
mod service;

pub use model::{
    DeleteFileOutput, FileKind, FileStat, FileTreeEntry, MutationReceipt, RecoverFileOutput,
    WriteFileOutput,
};
pub use service::FileService;

#[cfg(test)]
mod tests {
    use super::*;
    use skillgate_catalog::{GrantRegistry, PathRef};

    fn fixture() -> (tempfile::TempDir, tempfile::TempDir, FileService) {
        let root = tempfile::tempdir().unwrap();
        let quarantine = tempfile::tempdir().unwrap();
        let grants = GrantRegistry::new();
        grants
            .register_host_root("root", root.path(), "Fixture", false)
            .unwrap();
        let service = FileService::new(grants, quarantine.path()).unwrap();
        (root, quarantine, service)
    }

    fn path(relative_path: &str) -> PathRef {
        PathRef {
            grant_id: "root".into(),
            relative_path: relative_path.into(),
        }
    }

    #[cfg(unix)]
    fn create_directory_link(target: &std::path::Path, link: &std::path::Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[cfg(windows)]
    fn create_directory_link(target: &std::path::Path, link: &std::path::Path) {
        std::os::windows::fs::symlink_dir(target, link).unwrap();
    }

    #[test]
    fn reads_stats_and_lists_only_inside_the_granted_root() {
        let (root, _quarantine, service) = fixture();
        std::fs::create_dir(root.path().join("folder")).unwrap();
        std::fs::write(root.path().join("folder/a.md"), "hello").unwrap();
        std::fs::write(root.path().join("z.md"), "world").unwrap();

        assert_eq!(service.read_utf8(&path("folder/a.md")).unwrap(), "hello");
        let stat = service.stat(&path("folder/a.md")).unwrap();
        assert_eq!(stat.size, 5);
        assert_eq!(stat.kind, FileKind::File);
        assert!(!stat.revision.is_empty());

        let entries = service.list_directory(&path("")).unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["folder", "z.md"]
        );
        assert_eq!(entries[0].kind, FileKind::Directory);

        let escaped = service.read_utf8(&path("../outside.md")).unwrap_err();
        assert_eq!(escaped.code, skillgate_catalog::AppErrorCode::PathEscape);
    }

    #[test]
    fn tree_is_depth_bounded_sorted_and_skips_heavy_directories() {
        let (root, _quarantine, service) = fixture();
        std::fs::create_dir_all(root.path().join("a/deep")).unwrap();
        std::fs::create_dir(root.path().join("node_modules")).unwrap();
        std::fs::create_dir(root.path().join("bower_components")).unwrap();
        std::fs::create_dir_all(root.path().join("go/pkg")).unwrap();
        std::fs::create_dir_all(root.path().join("src/pkg")).unwrap();
        std::fs::write(root.path().join("a/deep/readme.md"), "nested").unwrap();
        std::fs::write(root.path().join("B.md"), "file").unwrap();

        let tree = service.tree(&path(""), 1).unwrap();
        let children = tree.children.unwrap();
        assert_eq!(
            children
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            ["a", "go", "src", "B.md"]
        );
        let folder = &children[0];
        assert_eq!(folder.children.as_ref().unwrap()[0].name, "deep");
        assert!(folder.children.as_ref().unwrap()[0].children.is_none());
        assert!(children[1].children.as_ref().unwrap().is_empty());
        assert_eq!(children[2].children.as_ref().unwrap()[0].name, "pkg");
    }

    #[test]
    fn invalid_utf8_is_a_stable_validation_error() {
        let (root, _quarantine, service) = fixture();
        std::fs::write(root.path().join("binary.md"), [0xff, 0xfe]).unwrap();
        let error = service.read_utf8(&path("binary.md")).unwrap_err();
        assert_eq!(error.code, skillgate_catalog::AppErrorCode::InvalidArgument);
        assert_eq!(
            error.category,
            skillgate_catalog::AppErrorCategory::Validation
        );
        assert_eq!(
            serde_json::to_value(error).unwrap()["code"],
            "INVALID_ARGUMENT"
        );
    }

    #[test]
    fn atomic_write_requires_the_expected_content_revision() {
        let (root, _quarantine, service) = fixture();
        std::fs::write(root.path().join("edit.md"), "before").unwrap();
        let before = service.stat(&path("edit.md")).unwrap();

        let written = service
            .write_utf8(&path("edit.md"), "after", Some(&before.revision), "write-1")
            .unwrap();
        assert_eq!(service.read_utf8(&path("edit.md")).unwrap(), "after");
        assert_ne!(written.revision, before.revision);
        assert!(written.receipt.committed);
        assert_eq!(written.receipt.idempotency_key, "write-1");

        let conflict = service
            .write_utf8(&path("edit.md"), "lost", Some(&before.revision), "write-2")
            .unwrap_err();
        assert_eq!(
            conflict.code,
            skillgate_catalog::AppErrorCode::RevisionConflict
        );
        assert_eq!(
            conflict.category,
            skillgate_catalog::AppErrorCategory::Conflict
        );
        assert_eq!(service.read_utf8(&path("edit.md")).unwrap(), "after");
    }

    #[test]
    fn quarantine_delete_and_recover_round_trip_without_overwriting() {
        let (root, _quarantine, service) = fixture();
        std::fs::write(root.path().join("remove.md"), "recover me").unwrap();
        let revision = service.stat(&path("remove.md")).unwrap().revision;
        let deleted = service
            .delete_to_quarantine(&path("remove.md"), Some(&revision), "delete-1")
            .unwrap();
        assert!(!root.path().join("remove.md").exists());

        std::fs::write(root.path().join("remove.md"), "new file").unwrap();
        let collision = service
            .recover(&deleted.recovery_token, "recover-1")
            .unwrap_err();
        assert_eq!(
            collision.code,
            skillgate_catalog::AppErrorCode::AlreadyExists
        );
        assert_eq!(
            std::fs::read_to_string(root.path().join("remove.md")).unwrap(),
            "new file"
        );

        std::fs::remove_file(root.path().join("remove.md")).unwrap();
        let recovered = service
            .recover(&deleted.recovery_token, "recover-2")
            .unwrap();
        assert_eq!(recovered.location, path("remove.md"));
        assert_eq!(service.read_utf8(&path("remove.md")).unwrap(), "recover me");
        assert_eq!(
            service
                .recover(&deleted.recovery_token, "recover-3")
                .unwrap_err()
                .code,
            skillgate_catalog::AppErrorCode::NotFound
        );
    }

    #[test]
    fn stale_delete_is_rejected_without_removing_the_file() {
        let (root, _quarantine, service) = fixture();
        std::fs::write(root.path().join("keep.md"), "first").unwrap();
        let stale = service.stat(&path("keep.md")).unwrap().revision;
        std::fs::write(root.path().join("keep.md"), "second").unwrap();
        let error = service
            .delete_to_quarantine(&path("keep.md"), Some(&stale), "delete-stale")
            .unwrap_err();
        assert_eq!(
            error.code,
            skillgate_catalog::AppErrorCode::RevisionConflict
        );
        assert_eq!(service.read_utf8(&path("keep.md")).unwrap(), "second");
    }

    #[test]
    fn recovery_revalidates_the_parent_and_rejects_a_link_swap() {
        let (root, _quarantine, service) = fixture();
        let outside = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("folder")).unwrap();
        std::fs::write(root.path().join("folder/item.md"), "safe").unwrap();
        let deleted = service
            .delete_to_quarantine(&path("folder/item.md"), None, "delete-swap")
            .unwrap();
        std::fs::remove_dir(root.path().join("folder")).unwrap();
        create_directory_link(outside.path(), &root.path().join("folder"));

        let error = service
            .recover(&deleted.recovery_token, "recover-swap")
            .unwrap_err();
        assert_eq!(error.code, skillgate_catalog::AppErrorCode::SymlinkEscape);
        assert!(!outside.path().join("item.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn file_service_rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let (root, _quarantine, service) = fixture();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.md"), "secret").unwrap();
        symlink(
            outside.path().join("secret.md"),
            root.path().join("escape.md"),
        )
        .unwrap();
        let error = service.read_utf8(&path("escape.md")).unwrap_err();
        assert_eq!(error.code, skillgate_catalog::AppErrorCode::SymlinkEscape);
    }

    #[cfg(windows)]
    #[test]
    fn file_service_rejects_windows_symlink_escape() {
        use std::os::windows::fs::symlink_file;
        let (root, _quarantine, service) = fixture();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret.md"), "secret").unwrap();
        symlink_file(
            outside.path().join("secret.md"),
            root.path().join("escape.md"),
        )
        .unwrap();
        let error = service.read_utf8(&path("escape.md")).unwrap_err();
        assert_eq!(error.code, skillgate_catalog::AppErrorCode::SymlinkEscape);
    }
}
