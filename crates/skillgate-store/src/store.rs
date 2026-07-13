use crate::lock::WriterLease;
use crate::migrations::{migrate, schema_version, verify_integrity};
use crate::repositories::{FavoritesRepository, PreferencesRepository, RemotesRepository};
use crate::{Result, StoreError, StorePaths, CURRENT_SCHEMA_VERSION};
use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReceipt {
    pub source_schema_version: i64,
    pub target_schema_version: i64,
    pub source_sha256: String,
    pub target_sha256: String,
    pub app_version: String,
    pub backup_path: PathBuf,
    pub migrated_at_unix_ms: u128,
}

pub struct Store {
    paths: StorePaths,
    connection: Connection,
    _lease: WriterLease,
    migration_receipt: Option<MigrationReceipt>,
}

impl Store {
    pub fn open(paths: StorePaths, app_version: &str) -> Result<Self> {
        paths.prepare()?;
        let lease = WriterLease::acquire(paths.writer_lock(), app_version)?;
        let migration_receipt = prepare_database(&paths, app_version)?;
        let connection = Connection::open(paths.database())?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        verify_integrity(&connection)?;
        Ok(Self {
            paths,
            connection,
            _lease: lease,
            migration_receipt,
        })
    }

    pub fn paths(&self) -> &StorePaths {
        &self.paths
    }

    pub fn schema_version(&self) -> Result<i64> {
        schema_version(&self.connection)
    }

    pub fn verify(&self) -> Result<()> {
        verify_integrity(&self.connection)
    }

    pub fn migration_receipt(&self) -> Option<&MigrationReceipt> {
        self.migration_receipt.as_ref()
    }

    pub fn preferences(&self) -> PreferencesRepository<'_> {
        PreferencesRepository {
            connection: &self.connection,
        }
    }

    pub fn favorites(&self) -> FavoritesRepository<'_> {
        FavoritesRepository {
            connection: &self.connection,
        }
    }

    pub fn remotes(&self) -> RemotesRepository<'_> {
        RemotesRepository {
            connection: &self.connection,
        }
    }
}

fn prepare_database(paths: &StorePaths, app_version: &str) -> Result<Option<MigrationReceipt>> {
    if !paths.database().exists() {
        let mut connection = Connection::open(paths.database())?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut connection)?;
        verify_integrity(&connection)?;
        connection.close().map_err(|(_, error)| error)?;
        sync_file(paths.database())?;
        return Ok(None);
    }

    let source = Connection::open_with_flags(
        paths.database(),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    source.pragma_update(None, "foreign_keys", "ON")?;
    verify_integrity(&source)?;
    let source_version = schema_version(&source)?;
    if source_version > CURRENT_SCHEMA_VERSION {
        return Err(StoreError::UnsupportedSchema {
            found: source_version,
            supported: CURRENT_SCHEMA_VERSION,
        });
    }
    if source_version == CURRENT_SCHEMA_VERSION {
        return Ok(None);
    }

    let token = unique_token();
    let backup_path = paths
        .backups()
        .join(format!("skillgate-v{source_version}-{token}.db"));
    online_backup(&source, &backup_path)?;
    drop(source);
    sync_file(&backup_path)?;
    sync_directory(paths.backups())?;

    let source_sha256 = file_sha256(&backup_path)?;
    let staging_path = paths.root().join(format!("skillgate.db.migrating-{token}"));
    fs::copy(&backup_path, &staging_path).map_err(|error| StoreError::io(&staging_path, error))?;
    let migration_result = (|| -> Result<String> {
        let mut staging = Connection::open(&staging_path)?;
        staging.pragma_update(None, "journal_mode", "DELETE")?;
        staging.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&mut staging)?;
        verify_integrity(&staging)?;
        staging.close().map_err(|(_, error)| error)?;
        sync_file(&staging_path)?;
        file_sha256(&staging_path)
    })();
    let target_sha256 = match migration_result {
        Ok(hash) => hash,
        Err(error) => {
            let quarantine = paths.backups().join(format!("failed-migration-{token}.db"));
            let _ = fs::rename(&staging_path, quarantine);
            return Err(error);
        }
    };

    atomic_replace(&staging_path, paths.database())?;
    remove_sqlite_sidecar(paths.database(), "-wal")?;
    remove_sqlite_sidecar(paths.database(), "-shm")?;
    sync_file(paths.database())?;
    sync_directory(paths.root())?;

    let receipt = MigrationReceipt {
        source_schema_version: source_version,
        target_schema_version: CURRENT_SCHEMA_VERSION,
        source_sha256,
        target_sha256,
        app_version: app_version.to_string(),
        backup_path: backup_path.clone(),
        migrated_at_unix_ms: now_ms(),
    };
    let receipt_path = paths.backups().join(format!("migration-{token}.json"));
    let receipt_json = serde_json::to_vec_pretty(&receipt)?;
    write_new_synced(&receipt_path, &receipt_json)?;
    sync_directory(paths.backups())?;
    Ok(Some(receipt))
}

fn online_backup(source: &Connection, destination_path: &Path) -> Result<()> {
    let mut destination = Connection::open(destination_path)?;
    let backup = Backup::new(source, &mut destination)?;
    backup.run_to_completion(32, Duration::from_millis(5), None)?;
    drop(backup);
    destination.close().map_err(|(_, error)| error)?;
    Ok(())
}

fn write_new_synced(path: &Path, contents: &[u8]) -> Result<()> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| StoreError::io(path, error))?;
    file.write_all(contents)
        .map_err(|error| StoreError::io(path, error))?;
    file.sync_all()
        .map_err(|error| StoreError::io(path, error))?;
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String> {
    let mut file = File::open(path).map_err(|error| StoreError::io(path, error))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| StoreError::io(path, error))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sync_file(path: &Path) -> Result<()> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|error| StoreError::io(path, error))
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> Result<()> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| StoreError::io(path, error))
}

#[cfg(windows)]
fn sync_directory(_path: &Path) -> Result<()> {
    Ok(())
}

fn remove_sqlite_sidecar(database: &Path, suffix: &str) -> Result<()> {
    let sidecar = PathBuf::from(format!("{}{suffix}", database.display()));
    match fs::remove_file(&sidecar) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(StoreError::io(sidecar, error)),
    }
}

#[cfg(unix)]
fn atomic_replace(source: &Path, destination: &Path) -> Result<()> {
    fs::rename(source, destination).map_err(|error| StoreError::io(destination, error))
}

#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let replaced = unsafe {
        ReplaceFileW(
            destination_wide.as_ptr(),
            source_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if replaced == 0 {
        return Err(StoreError::io(destination, std::io::Error::last_os_error()));
    }
    Ok(())
}

fn unique_token() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!(
        "{}-{}-{}",
        now_ms(),
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
