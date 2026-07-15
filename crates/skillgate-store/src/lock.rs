use crate::{Result, StoreError};
#[cfg(not(windows))]
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriterMetadata {
    pub product: String,
    pub pid: u32,
    pub process_start_identity: String,
    pub version: String,
    pub mode: String,
    pub acquired_at_unix_ms: u128,
}

impl WriterMetadata {
    fn current(version: &str) -> Self {
        static PROCESS_START: OnceLock<String> = OnceLock::new();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        Self {
            product: "Skillgate".to_string(),
            pid: std::process::id(),
            process_start_identity: PROCESS_START
                .get_or_init(|| format!("{}-{now}", std::process::id()))
                .clone(),
            version: version.to_string(),
            mode: "read-write".to_string(),
            acquired_at_unix_ms: now,
        }
    }
}

pub(crate) struct WriterLease {
    file: File,
}

impl WriterLease {
    pub(crate) fn acquire(path: &Path, version: &str) -> Result<Self> {
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)
            .map_err(|error| StoreError::io(path, error))?;
        if try_lock_exclusive(&file).is_err() {
            let mut owner = String::new();
            let _ = file.seek(SeekFrom::Start(0));
            let _ = file.read_to_string(&mut owner);
            let owner = if owner.trim().is_empty() {
                String::new()
            } else {
                format!(": {}", owner.trim())
            };
            return Err(StoreError::WriterBusy { owner });
        }
        let metadata = serde_json::to_vec_pretty(&WriterMetadata::current(version))?;
        file.set_len(0)
            .map_err(|error| StoreError::io(path, error))?;
        file.seek(SeekFrom::Start(0))
            .map_err(|error| StoreError::io(path, error))?;
        file.write_all(&metadata)
            .map_err(|error| StoreError::io(path, error))?;
        file.sync_all()
            .map_err(|error| StoreError::io(path, error))?;
        Ok(Self { file })
    }
}

impl Drop for WriterLease {
    fn drop(&mut self) {
        let _ = self.file.set_len(0);
        let _ = self.file.sync_all();
        let _ = unlock(&self.file);
    }
}

#[cfg(not(windows))]
fn try_lock_exclusive(file: &File) -> std::io::Result<()> {
    file.try_lock_exclusive()
}

#[cfg(not(windows))]
fn unlock(file: &File) -> std::io::Result<()> {
    FileExt::unlock(file)
}

#[cfg(windows)]
fn try_lock_exclusive(file: &File) -> std::io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::LockFile;

    // Lock one byte beyond any realistic metadata payload. Windows byte-range
    // locks deny reads of the locked range, so keeping the range separate lets
    // a rejected writer read the JSON owner metadata for diagnostics.
    let locked = unsafe { LockFile(file.as_raw_handle(), u32::MAX, u32::MAX, 1, 0) };
    if locked == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(windows)]
fn unlock(file: &File) -> std::io::Result<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::UnlockFile;

    let unlocked = unsafe { UnlockFile(file.as_raw_handle(), u32::MAX, u32::MAX, 1, 0) };
    if unlocked == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}
