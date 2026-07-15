use crate::{Result, StoreError, CURRENT_SCHEMA_VERSION};
use rusqlite::{Connection, Transaction};

const V1: &str = r#"
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS remote_servers (
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
CREATE TABLE IF NOT EXISTS remote_skills (
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
CREATE INDEX IF NOT EXISTS idx_remote_skills_server ON remote_skills(server_id);
"#;

const V2: &str = r#"
CREATE TABLE IF NOT EXISTS cached_skills (
  canonical_path TEXT PRIMARY KEY,
  folder_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agents TEXT NOT NULL DEFAULT '[]',
  agent_short_codes TEXT NOT NULL DEFAULT '[]',
  scope TEXT NOT NULL DEFAULT 'global',
  project_name TEXT,
  has_supporting_files INTEGER NOT NULL DEFAULT 0,
  supporting_files TEXT NOT NULL DEFAULT '[]',
  source TEXT,
  source_type TEXT,
  installed_at TEXT,
  updated_at TEXT,
  file_mod_time TEXT NOT NULL,
  scanned_at TEXT NOT NULL
);
"#;

const V3: &str = r#"
CREATE TABLE IF NOT EXISTS favorites (
  skill_name TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

const V4: &str = r#"
CREATE TABLE IF NOT EXISTS trending_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
"#;

pub(crate) fn schema_version(connection: &Connection) -> Result<i64> {
    let exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version')",
        [],
        |row| row.get(0),
    )?;
    if !exists {
        return Ok(0);
    }
    Ok(connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_version",
        [],
        |row| row.get(0),
    )?)
}

pub(crate) fn migrate(connection: &mut Connection) -> Result<()> {
    let current = schema_version(connection)?;
    if current > CURRENT_SCHEMA_VERSION {
        return Err(StoreError::UnsupportedSchema {
            found: current,
            supported: CURRENT_SCHEMA_VERSION,
        });
    }
    if current == CURRENT_SCHEMA_VERSION {
        patch_cached_skills(connection)?;
        return Ok(());
    }

    let transaction = connection.transaction()?;
    for (version, sql) in [(1, V1), (2, V2), (3, V3), (4, V4)] {
        if version > current {
            transaction.execute_batch(sql)?;
            transaction.execute(
                "INSERT OR IGNORE INTO schema_version(version) VALUES (?1)",
                [version],
            )?;
        }
    }
    if current < 5 {
        patch_cached_skills_transaction(&transaction)?;
        transaction.execute(
            "INSERT OR IGNORE INTO schema_version(version) VALUES (5)",
            [],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

fn patch_cached_skills(connection: &Connection) -> Result<()> {
    for (name, ddl) in cached_skill_patches() {
        if !table_has_column(connection, "cached_skills", name)? {
            connection.execute_batch(&format!("ALTER TABLE cached_skills ADD COLUMN {ddl}"))?;
        }
    }
    Ok(())
}

fn patch_cached_skills_transaction(transaction: &Transaction<'_>) -> Result<()> {
    for (name, ddl) in cached_skill_patches() {
        if !table_has_column(transaction, "cached_skills", name)? {
            transaction.execute_batch(&format!("ALTER TABLE cached_skills ADD COLUMN {ddl}"))?;
        }
    }
    Ok(())
}

fn cached_skill_patches() -> [(&'static str, &'static str); 5] {
    [
        ("project_name", "project_name TEXT"),
        (
            "has_supporting_files",
            "has_supporting_files INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "supporting_files",
            "supporting_files TEXT NOT NULL DEFAULT '[]'",
        ),
        ("installed_at", "installed_at TEXT"),
        ("updated_at", "updated_at TEXT"),
    ]
}

fn table_has_column(connection: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
    let names = statement.query_map([], |row| row.get::<_, String>(1))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub(crate) fn verify_integrity(connection: &Connection) -> Result<()> {
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(StoreError::Integrity(integrity));
    }
    let mut statement = connection.prepare("PRAGMA foreign_key_check")?;
    let mut rows = statement.query([])?;
    if let Some(row) = rows.next()? {
        let table: String = row.get(0)?;
        return Err(StoreError::ForeignKey(table));
    }
    Ok(())
}
