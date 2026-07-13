use rusqlite::Connection;
use serde_json::json;
use skillgate_store::{
    FavoriteToggle, RemoteServer, Store, StoreError, StorePaths, CURRENT_SCHEMA_VERSION,
};
use std::fs;
use tempfile::TempDir;

fn paths(temp: &TempDir) -> StorePaths {
    StorePaths::for_home(temp.path())
}

fn open(temp: &TempDir) -> Store {
    Store::open(paths(temp), "test-build").expect("store should open")
}

fn create_legacy_v1(temp: &TempDir) {
    let paths = paths(temp);
    fs::create_dir_all(paths.root()).unwrap();
    let connection = Connection::open(paths.database()).unwrap();
    connection
        .execute_batch(
            r#"
            PRAGMA foreign_keys=ON;
            CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
            INSERT INTO schema_version VALUES (1);
            CREATE TABLE settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE remote_servers (
              id TEXT PRIMARY KEY,
              label TEXT NOT NULL,
              host TEXT NOT NULL,
              port INTEGER NOT NULL DEFAULT 22,
              username TEXT NOT NULL,
              skills_base_path TEXT NOT NULL DEFAULT '~/.agents/skills',
              ssh_key_path TEXT,
              last_sync_at TEXT,
              last_sync_error TEXT,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(host, port, username)
            );
            CREATE TABLE remote_skills (
              id TEXT PRIMARY KEY,
              server_id TEXT NOT NULL REFERENCES remote_servers(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              description TEXT,
              remote_path TEXT NOT NULL,
              content TEXT,
              content_hash TEXT,
              synced_at TEXT NOT NULL DEFAULT (datetime('now')),
              UNIQUE(server_id, remote_path)
            );
            CREATE INDEX idx_remote_skills_server ON remote_skills(server_id);
            INSERT INTO settings(key, value) VALUES ('language', '"zh-CN"');
            INSERT INTO remote_servers(id, label, host, username)
              VALUES ('server-1', 'Build host', 'build.example.test', 'runner');
            INSERT INTO remote_skills(id, server_id, name, remote_path)
              VALUES ('skill-1', 'server-1', 'Release', '/skills/release');
            "#,
        )
        .unwrap();
}

#[test]
fn fresh_database_has_complete_v5_schema_and_integrity() {
    let temp = TempDir::new().unwrap();
    let store = open(&temp);
    assert_eq!(store.schema_version().unwrap(), CURRENT_SCHEMA_VERSION);
    store.verify().unwrap();

    let connection = Connection::open(store.paths().database()).unwrap();
    for table in [
        "settings",
        "remote_servers",
        "remote_skills",
        "cached_skills",
        "favorites",
        "trending_cache",
    ] {
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                [table],
                |row| row.get(0),
            )
            .unwrap();
        assert!(exists, "missing table {table}");
    }
    let columns: Vec<String> = connection
        .prepare("PRAGMA table_info(cached_skills)")
        .unwrap()
        .query_map([], |row| row.get(1))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    for column in [
        "project_name",
        "has_supporting_files",
        "supporting_files",
        "installed_at",
        "updated_at",
    ] {
        assert!(
            columns.iter().any(|actual| actual == column),
            "missing column {column}"
        );
    }
}

#[test]
fn legacy_v1_is_backed_up_then_migrated_without_losing_rows() {
    let temp = TempDir::new().unwrap();
    create_legacy_v1(&temp);

    let store = open(&temp);
    let receipt = store.migration_receipt().expect("migration receipt");
    assert_eq!(receipt.source_schema_version, 1);
    assert_eq!(receipt.target_schema_version, 5);
    assert!(receipt.backup_path.exists());
    assert_eq!(
        store.preferences().get("language").unwrap(),
        Some(json!("zh-CN"))
    );
    assert_eq!(
        store.remotes().get("server-1").unwrap().unwrap().label,
        "Build host"
    );

    let backup = Connection::open(&receipt.backup_path).unwrap();
    let backup_version: i64 = backup
        .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(backup_version, 1);
    let remote_skill_count: i64 = backup
        .query_row("SELECT COUNT(*) FROM remote_skills", [], |row| row.get(0))
        .unwrap();
    assert_eq!(remote_skill_count, 1);
    assert!(fs::read_dir(store.paths().backups())
        .unwrap()
        .filter_map(Result::ok)
        .any(|entry| entry
            .file_name()
            .to_string_lossy()
            .starts_with("migration-")));
}

#[test]
fn reopen_is_idempotent_and_does_not_create_another_backup() {
    let temp = TempDir::new().unwrap();
    create_legacy_v1(&temp);
    {
        let store = open(&temp);
        store.preferences().set("theme", &json!("dark")).unwrap();
        assert_eq!(
            store.favorites().toggle("release").unwrap(),
            FavoriteToggle::Added
        );
    }
    let before = fs::read_dir(paths(&temp).backups()).unwrap().count();
    {
        let store = open(&temp);
        assert!(store.migration_receipt().is_none());
        assert_eq!(
            store.preferences().get("theme").unwrap(),
            Some(json!("dark"))
        );
        assert_eq!(store.favorites().list().unwrap(), vec!["release"]);
    }
    let after = fs::read_dir(paths(&temp).backups()).unwrap().count();
    assert_eq!(before, after);
}

#[test]
fn a_second_writer_is_rejected_with_owner_metadata() {
    let temp = TempDir::new().unwrap();
    let first = open(&temp);
    let second = Store::open(paths(&temp), "second-build");
    match second {
        Err(StoreError::WriterBusy { owner }) => {
            assert!(owner.contains("Skillgate"));
            assert!(owner.contains(&std::process::id().to_string()));
        }
        Err(error) => panic!("unexpected error: {error}"),
        Ok(_) => panic!("second writer unexpectedly acquired the database"),
    }
    drop(first);
    assert!(Store::open(paths(&temp), "third-build").is_ok());
}

#[test]
fn preference_favorite_and_remote_repositories_round_trip() {
    let temp = TempDir::new().unwrap();
    let store = open(&temp);
    store.preferences().set("language", &json!("en")).unwrap();
    store
        .preferences()
        .set("terminal", &json!({ "width": 420 }))
        .unwrap();
    assert_eq!(store.preferences().all().unwrap()["language"], json!("en"));
    assert_eq!(
        store.favorites().toggle("agentdex").unwrap(),
        FavoriteToggle::Added
    );
    assert_eq!(
        store.favorites().toggle("agentdex").unwrap(),
        FavoriteToggle::Removed
    );

    let mut remote = RemoteServer {
        id: "remote-1".to_string(),
        label: "Primary".to_string(),
        host: "example.test".to_string(),
        port: 22,
        username: "skillgate".to_string(),
        skills_base_path: "~/.agents/skills".to_string(),
        ssh_key_path: Some("~/.ssh/id_ed25519".to_string()),
        last_sync_at: None,
        last_sync_error: None,
        created_at: None,
    };
    store.remotes().create(&remote).unwrap();
    remote.label = "Updated".to_string();
    remote.port = 2222;
    store.remotes().update(&remote).unwrap();
    let stored = store.remotes().get("remote-1").unwrap().unwrap();
    assert_eq!(stored.label, "Updated");
    assert_eq!(stored.port, 2222);
    assert_eq!(store.remotes().list().unwrap(), vec![stored]);
    assert!(store.remotes().delete("remote-1").unwrap());
    assert!(!store.remotes().delete("remote-1").unwrap());
}

#[test]
fn unsupported_future_schema_is_never_modified_or_backed_up() {
    let temp = TempDir::new().unwrap();
    let paths = paths(&temp);
    fs::create_dir_all(paths.root()).unwrap();
    let connection = Connection::open(paths.database()).unwrap();
    connection.execute_batch("CREATE TABLE schema_version(version INTEGER PRIMARY KEY); INSERT INTO schema_version VALUES (99);").unwrap();
    drop(connection);

    match Store::open(paths.clone(), "test") {
        Err(StoreError::UnsupportedSchema {
            found: 99,
            supported: 5,
        }) => {}
        Err(error) => panic!("unexpected error: {error}"),
        Ok(_) => panic!("future schema unexpectedly opened"),
    }
    assert_eq!(fs::read_dir(paths.backups()).unwrap().count(), 0);
}
