use crate::model::{
    DeleteFileOutput, FileKind, FileStat, FileTreeEntry, MutationReceipt, RecoverFileOutput,
    WriteFileOutput,
};
use chrono::{DateTime, SecondsFormat, Utc};
use skillgate_catalog::{
    AppError, AppErrorCategory, AppErrorCode, AppResult, GrantRegistry, PathRef,
};
use std::collections::BTreeMap;
use std::fs::{self, File, Metadata};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
struct RecoveryRecord {
    original: PathRef,
    quarantined_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct FileService {
    grants: GrantRegistry,
    quarantine_root: PathBuf,
    recoveries: Arc<Mutex<BTreeMap<String, RecoveryRecord>>>,
}

impl FileService {
    pub fn new(grants: GrantRegistry, quarantine_root: impl AsRef<Path>) -> AppResult<Self> {
        fs::create_dir_all(quarantine_root.as_ref())
            .map_err(|error| io_error(&error, "quarantine creation"))?;
        let quarantine_root = fs::canonicalize(quarantine_root.as_ref())
            .map_err(|error| io_error(&error, "quarantine resolution"))?;
        if !quarantine_root.is_dir() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "quarantine root is not a directory",
            ));
        }
        Ok(Self {
            grants,
            quarantine_root,
            recoveries: Arc::new(Mutex::new(BTreeMap::new())),
        })
    }

    pub fn grants(&self) -> &GrantRegistry {
        &self.grants
    }

    pub fn read_utf8(&self, location: &PathRef) -> AppResult<String> {
        let authorized = self.grants.authorize_existing(location)?;
        let bytes =
            fs::read(authorized.as_path()).map_err(|error| io_error(&error, "file read"))?;
        String::from_utf8(bytes).map_err(|_| {
            AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "file content is not valid UTF-8",
            )
        })
    }

    pub fn stat(&self, location: &PathRef) -> AppResult<FileStat> {
        let authorized = self.grants.authorize_existing(location)?;
        let metadata =
            fs::metadata(authorized.as_path()).map_err(|error| io_error(&error, "file stat"))?;
        file_stat(location.clone(), authorized.as_path(), &metadata)
    }

    pub fn list_directory(&self, directory: &PathRef) -> AppResult<Vec<FileTreeEntry>> {
        let authorized = self.grants.authorize_existing(directory)?;
        if !authorized.as_path().is_dir() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "location is not a directory",
            ));
        }
        list_entries(authorized.as_path(), directory)
    }

    pub fn tree(&self, directory: &PathRef, depth: usize) -> AppResult<FileTreeEntry> {
        let authorized = self.grants.authorize_existing(directory)?;
        let metadata = fs::metadata(authorized.as_path())
            .map_err(|error| io_error(&error, "tree root stat"))?;
        if !metadata.is_dir() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "tree root is not a directory",
            ));
        }
        let name = authorized
            .as_path()
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| directory.grant_id.clone());
        let mut root = tree_entry(directory.clone(), name, FileKind::Directory, &metadata);
        root.children = Some(build_tree(self, directory, depth)?);
        Ok(root)
    }

    pub fn write_utf8(
        &self,
        location: &PathRef,
        content: &str,
        expected_revision: Option<&str>,
        idempotency_key: impl Into<String>,
    ) -> AppResult<WriteFileOutput> {
        let first = self.grants.authorize_existing(location)?;
        let first_metadata =
            fs::metadata(first.as_path()).map_err(|error| io_error(&error, "write target stat"))?;
        if !first_metadata.is_file() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "write target is not a file",
            ));
        }
        let current_revision = revision_for_path(first.as_path(), &first_metadata)?;
        check_revision(expected_revision, &current_revision)?;

        let parent = first.as_path().parent().ok_or_else(|| {
            AppError::new(
                AppErrorCode::PathEscape,
                AppErrorCategory::Authorization,
                "write target has no granted parent",
            )
        })?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|error| io_error(&error, "atomic write temporary file"))?;
        temporary
            .as_file()
            .set_permissions(first_metadata.permissions())
            .map_err(|error| io_error(&error, "atomic write permissions"))?;
        temporary
            .write_all(content.as_bytes())
            .map_err(|error| io_error(&error, "atomic write content"))?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|error| io_error(&error, "atomic write sync"))?;

        let revalidated = self.grants.authorize_existing(location)?;
        if revalidated.as_path() != first.as_path() {
            return Err(AppError::new(
                AppErrorCode::RevisionConflict,
                AppErrorCategory::Conflict,
                "write target changed before commit",
            ));
        }
        let revalidated_metadata = fs::metadata(revalidated.as_path())
            .map_err(|error| io_error(&error, "write target revalidation"))?;
        let latest_revision = revision_for_path(revalidated.as_path(), &revalidated_metadata)?;
        if latest_revision != current_revision {
            return Err(revision_conflict(&latest_revision));
        }

        temporary
            .persist(revalidated.as_path())
            .map_err(|error| io_error(&error.error, "atomic write commit"))?;
        sync_parent(parent)?;
        let committed = self.grants.authorize_existing(location)?;
        let committed_metadata = fs::metadata(committed.as_path())
            .map_err(|error| io_error(&error, "written file stat"))?;
        let revision = revision_for_path(committed.as_path(), &committed_metadata)?;
        Ok(WriteFileOutput {
            revision,
            receipt: receipt(idempotency_key),
        })
    }

    pub fn delete_to_quarantine(
        &self,
        location: &PathRef,
        expected_revision: Option<&str>,
        idempotency_key: impl Into<String>,
    ) -> AppResult<DeleteFileOutput> {
        let authorized = self.grants.authorize_existing(location)?;
        let metadata = fs::metadata(authorized.as_path())
            .map_err(|error| io_error(&error, "delete target stat"))?;
        if !metadata.is_file() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "only files can be quarantined",
            ));
        }
        let current_revision = revision_for_path(authorized.as_path(), &metadata)?;
        check_revision(expected_revision, &current_revision)?;

        let revalidated = self.grants.authorize_existing(location)?;
        if revalidated.as_path() != authorized.as_path() {
            return Err(revision_conflict(&current_revision));
        }
        let latest_metadata = fs::metadata(revalidated.as_path())
            .map_err(|error| io_error(&error, "delete target revalidation"))?;
        let latest_revision = revision_for_path(revalidated.as_path(), &latest_metadata)?;
        if latest_revision != current_revision {
            return Err(revision_conflict(&latest_revision));
        }
        let token = next_token();
        let token_directory = self.quarantine_root.join(&token);
        fs::create_dir(&token_directory)
            .map_err(|error| io_error(&error, "quarantine token creation"))?;
        let quarantined_path = token_directory.join("content");
        move_file(revalidated.as_path(), &quarantined_path)?;
        self.recoveries.lock().map_err(|_| lock_error())?.insert(
            token.clone(),
            RecoveryRecord {
                original: location.clone(),
                quarantined_path,
            },
        );
        Ok(DeleteFileOutput {
            recovery_token: token,
            recoverable_until: None,
            receipt: receipt(idempotency_key),
        })
    }

    pub fn recover(
        &self,
        recovery_token: &str,
        idempotency_key: impl Into<String>,
    ) -> AppResult<RecoverFileOutput> {
        let record = self
            .recoveries
            .lock()
            .map_err(|_| lock_error())?
            .get(recovery_token)
            .cloned()
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::NotFound,
                    AppErrorCategory::NotFound,
                    "recovery token is unknown or expired",
                )
            })?;
        let target = self.grants.authorize_target(&record.original)?;
        if target.as_path().exists() || fs::symlink_metadata(target.as_path()).is_ok() {
            return Err(AppError::new(
                AppErrorCode::AlreadyExists,
                AppErrorCategory::Conflict,
                "recovery target already exists",
            ));
        }
        move_file(&record.quarantined_path, target.as_path())?;
        self.recoveries
            .lock()
            .map_err(|_| lock_error())?
            .remove(recovery_token);
        if let Some(directory) = record.quarantined_path.parent() {
            let _ = fs::remove_dir(directory);
        }
        Ok(RecoverFileOutput {
            location: record.original,
            receipt: receipt(idempotency_key),
        })
    }
}

fn build_tree(
    service: &FileService,
    directory: &PathRef,
    depth: usize,
) -> AppResult<Vec<FileTreeEntry>> {
    let mut entries = service.list_directory(directory)?;
    if depth == 0 {
        return Ok(entries);
    }
    for entry in &mut entries {
        if entry.kind == FileKind::Directory {
            entry.children = Some(build_tree(service, &entry.location, depth - 1)?);
        }
    }
    Ok(entries)
}

fn list_entries(directory_path: &Path, directory: &PathRef) -> AppResult<Vec<FileTreeEntry>> {
    let mut entries = Vec::new();
    let read_dir =
        fs::read_dir(directory_path).map_err(|error| io_error(&error, "directory listing"))?;
    for entry in read_dir {
        let entry = entry.map_err(|error| io_error(&error, "directory entry"))?;
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| io_error(&error, "directory entry stat"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let kind = kind_from_metadata(&metadata);
        if kind == FileKind::Directory
            && skillgate_catalog::is_noise_directory(&entry.path(), &name)
        {
            continue;
        }
        let relative_path = join_relative(&directory.relative_path, &name);
        let location = PathRef {
            grant_id: directory.grant_id.clone(),
            relative_path,
        };
        entries.push(tree_entry(location, name, kind, &metadata));
    }
    entries.sort_by(|left, right| {
        let left_rank = if left.kind == FileKind::Directory {
            0
        } else {
            1
        };
        let right_rank = if right.kind == FileKind::Directory {
            0
        } else {
            1
        };
        left_rank
            .cmp(&right_rank)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

fn tree_entry(
    location: PathRef,
    name: String,
    kind: FileKind,
    metadata: &Metadata,
) -> FileTreeEntry {
    FileTreeEntry {
        entry_id: stable_id(&format!("{}|{}", location.grant_id, location.relative_path)),
        name,
        location,
        kind,
        size: (kind == FileKind::File).then_some(metadata.len()),
        modified_at: format_time(metadata.modified().ok()),
        children: None,
    }
}

fn file_stat(location: PathRef, path: &Path, metadata: &Metadata) -> AppResult<FileStat> {
    Ok(FileStat {
        location,
        kind: kind_from_metadata(metadata),
        size: metadata.len(),
        created_at: metadata.created().ok().map(|time| format_time(Some(time))),
        modified_at: format_time(metadata.modified().ok()),
        revision: revision_for_path(path, metadata)?,
    })
}

fn kind_from_metadata(metadata: &Metadata) -> FileKind {
    if metadata.file_type().is_symlink() {
        FileKind::Symlink
    } else if metadata.is_dir() {
        FileKind::Directory
    } else {
        FileKind::File
    }
}

fn revision_for_path(path: &Path, metadata: &Metadata) -> AppResult<String> {
    if metadata.is_file() {
        let mut file = File::open(path).map_err(|error| io_error(&error, "revision read"))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| io_error(&error, "revision read"))?;
        Ok(stable_id_bytes(&bytes))
    } else {
        Ok(stable_id(&format!(
            "{}|{}",
            metadata.len(),
            format_time(metadata.modified().ok())
        )))
    }
}

fn check_revision(expected: Option<&str>, actual: &str) -> AppResult<()> {
    if let Some(expected) = expected {
        if expected != actual {
            return Err(revision_conflict(actual));
        }
    }
    Ok(())
}

fn revision_conflict(actual: &str) -> AppError {
    AppError::new(
        AppErrorCode::RevisionConflict,
        AppErrorCategory::Conflict,
        "file changed since it was read",
    )
    .with_detail("actualRevision", actual)
}

fn move_file(source: &Path, target: &Path) -> AppResult<()> {
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            let parent = target
                .parent()
                .ok_or_else(|| io_error(&rename_error, "file move"))?;
            let mut temporary = tempfile::NamedTempFile::new_in(parent)
                .map_err(|error| io_error(&error, "cross-volume move temporary file"))?;
            let mut input =
                File::open(source).map_err(|error| io_error(&error, "cross-volume move source"))?;
            std::io::copy(&mut input, &mut temporary)
                .map_err(|error| io_error(&error, "cross-volume move copy"))?;
            temporary
                .as_file()
                .sync_all()
                .map_err(|error| io_error(&error, "cross-volume move sync"))?;
            temporary
                .persist_noclobber(target)
                .map_err(|error| io_error(&error.error, "cross-volume move commit"))?;
            fs::remove_file(source)
                .map_err(|error| io_error(&error, "cross-volume move source removal"))?;
            Ok(())
        }
    }
}

fn receipt(idempotency_key: impl Into<String>) -> MutationReceipt {
    MutationReceipt {
        committed: true,
        idempotency_key: idempotency_key.into(),
        replayed: false,
    }
}

fn next_token() -> String {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!(
        "recovery-{}-{}",
        Utc::now().timestamp_micros(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    )
}

fn join_relative(parent: &str, child: &str) -> String {
    if parent.is_empty() {
        child.to_string()
    } else {
        format!("{parent}/{child}")
    }
}

fn stable_id(material: &str) -> String {
    stable_id_bytes(material.as_bytes())
}

fn stable_id_bytes(bytes: &[u8]) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn format_time(time: Option<std::time::SystemTime>) -> String {
    time.map(DateTime::<Utc>::from)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn sync_parent(parent: &Path) -> AppResult<()> {
    #[cfg(unix)]
    {
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| io_error(&error, "atomic write parent sync"))?;
    }
    #[cfg(not(unix))]
    let _ = parent;
    Ok(())
}

fn io_error(error: &std::io::Error, operation: &'static str) -> AppError {
    let (code, category) = match error.kind() {
        std::io::ErrorKind::NotFound => (AppErrorCode::NotFound, AppErrorCategory::NotFound),
        std::io::ErrorKind::PermissionDenied => (
            AppErrorCode::PermissionDenied,
            AppErrorCategory::Authorization,
        ),
        std::io::ErrorKind::AlreadyExists => {
            (AppErrorCode::AlreadyExists, AppErrorCategory::Conflict)
        }
        _ => (AppErrorCode::Internal, AppErrorCategory::Internal),
    };
    AppError::new(code, category, format!("{operation} failed"))
        .with_detail("ioKind", format!("{:?}", error.kind()))
}

fn lock_error() -> AppError {
    AppError::new(
        AppErrorCode::Internal,
        AppErrorCategory::Internal,
        "file service state is unavailable",
    )
}
