use crate::{Result, StoreError};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub struct PreferencesRepository<'connection> {
    pub(crate) connection: &'connection Connection,
}

impl PreferencesRepository<'_> {
    pub fn get(&self, key: &str) -> Result<Option<Value>> {
        let raw: Option<String> = self
            .connection
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()?;
        raw.map(|value| {
            serde_json::from_str(&value).map_err(|error| StoreError::InvalidPreference {
                key: key.to_string(),
                message: error.to_string(),
            })
        })
        .transpose()
    }

    pub fn set(&self, key: &str, value: &Value) -> Result<()> {
        let value = serde_json::to_string(value)?;
        self.connection.execute(
            "INSERT INTO settings(key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn all(&self) -> Result<BTreeMap<String, Value>> {
        let mut statement = self
            .connection
            .prepare("SELECT key, value FROM settings ORDER BY key")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut values = BTreeMap::new();
        for row in rows {
            let (key, raw) = row?;
            let value =
                serde_json::from_str(&raw).map_err(|error| StoreError::InvalidPreference {
                    key: key.clone(),
                    message: error.to_string(),
                })?;
            values.insert(key, value);
        }
        Ok(values)
    }
}

pub struct FavoritesRepository<'connection> {
    pub(crate) connection: &'connection Connection,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FavoriteToggle {
    Added,
    Removed,
}

impl FavoritesRepository<'_> {
    pub fn list(&self) -> Result<Vec<String>> {
        let mut statement = self.connection.prepare(
            "SELECT skill_name FROM favorites ORDER BY created_at, skill_name COLLATE NOCASE",
        )?;
        let rows = statement.query_map([], |row| row.get(0))?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn contains(&self, name: &str) -> Result<bool> {
        Ok(self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM favorites WHERE skill_name = ?1)",
            [name],
            |row| row.get(0),
        )?)
    }

    pub fn toggle(&self, name: &str) -> Result<FavoriteToggle> {
        if self.contains(name)? {
            self.connection
                .execute("DELETE FROM favorites WHERE skill_name = ?1", [name])?;
            Ok(FavoriteToggle::Removed)
        } else {
            self.connection
                .execute("INSERT INTO favorites(skill_name) VALUES (?1)", [name])?;
            Ok(FavoriteToggle::Added)
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServer {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub skills_base_path: String,
    pub ssh_key_path: Option<String>,
    pub last_sync_at: Option<String>,
    pub last_sync_error: Option<String>,
    pub created_at: Option<String>,
}

pub struct RemotesRepository<'connection> {
    pub(crate) connection: &'connection Connection,
}

impl RemotesRepository<'_> {
    pub fn list(&self) -> Result<Vec<RemoteServer>> {
        let mut statement = self.connection.prepare(
            "SELECT id, label, host, port, username, skills_base_path, ssh_key_path,
                    last_sync_at, last_sync_error, created_at
             FROM remote_servers ORDER BY label COLLATE NOCASE, id",
        )?;
        let rows = statement.query_map([], map_remote)?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(Into::into)
    }

    pub fn get(&self, id: &str) -> Result<Option<RemoteServer>> {
        self.connection
            .query_row(
                "SELECT id, label, host, port, username, skills_base_path, ssh_key_path,
                        last_sync_at, last_sync_error, created_at
                 FROM remote_servers WHERE id = ?1",
                [id],
                map_remote,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn create(&self, server: &RemoteServer) -> Result<()> {
        self.connection.execute(
            "INSERT INTO remote_servers(
               id, label, host, port, username, skills_base_path, ssh_key_path,
               last_sync_at, last_sync_error, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, COALESCE(?10, datetime('now')))",
            params![
                server.id,
                server.label,
                server.host,
                server.port,
                server.username,
                server.skills_base_path,
                server.ssh_key_path,
                server.last_sync_at,
                server.last_sync_error,
                server.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn update(&self, server: &RemoteServer) -> Result<()> {
        let changed = self.connection.execute(
            "UPDATE remote_servers SET
               label=?2, host=?3, port=?4, username=?5, skills_base_path=?6,
               ssh_key_path=?7, last_sync_at=?8, last_sync_error=?9
             WHERE id=?1",
            params![
                server.id,
                server.label,
                server.host,
                server.port,
                server.username,
                server.skills_base_path,
                server.ssh_key_path,
                server.last_sync_at,
                server.last_sync_error,
            ],
        )?;
        if changed == 0 {
            return Err(StoreError::RemoteNotFound(server.id.clone()));
        }
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<bool> {
        Ok(self
            .connection
            .execute("DELETE FROM remote_servers WHERE id = ?1", [id])?
            > 0)
    }
}

fn map_remote(row: &rusqlite::Row<'_>) -> rusqlite::Result<RemoteServer> {
    Ok(RemoteServer {
        id: row.get(0)?,
        label: row.get(1)?,
        host: row.get(2)?,
        port: row.get(3)?,
        username: row.get(4)?,
        skills_base_path: row.get(5)?,
        ssh_key_path: row.get(6)?,
        last_sync_at: row.get(7)?,
        last_sync_error: row.get(8)?,
        created_at: row.get(9)?,
    })
}
