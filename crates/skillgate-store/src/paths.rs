use crate::{Result, StoreError};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorePaths {
    home: PathBuf,
    root: PathBuf,
    database: PathBuf,
    writer_lock: PathBuf,
    backups: PathBuf,
}

impl StorePaths {
    pub fn for_home(home: impl Into<PathBuf>) -> Self {
        let home = home.into();
        let root = home.join(".skillgate");
        Self {
            database: root.join("skillgate.db"),
            writer_lock: root.join("skillgate.db.writer"),
            backups: root.join("backups"),
            home,
            root,
        }
    }

    pub fn from_environment() -> Result<Self> {
        let home = std::env::var_os("USERPROFILE")
            .or_else(|| std::env::var_os("HOME"))
            .map(PathBuf::from)
            .ok_or_else(|| {
                StoreError::io(
                    "<home>",
                    std::io::Error::other("home directory is unavailable"),
                )
            })?;
        Ok(Self::for_home(home))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn database(&self) -> &Path {
        &self.database
    }

    pub fn writer_lock(&self) -> &Path {
        &self.writer_lock
    }

    pub fn backups(&self) -> &Path {
        &self.backups
    }

    pub(crate) fn prepare(&self) -> Result<()> {
        let canonical_home =
            fs::canonicalize(&self.home).map_err(|error| StoreError::io(&self.home, error))?;
        let expected_root = canonical_home.join(".skillgate");
        fs::create_dir_all(&expected_root)
            .map_err(|error| StoreError::io(&expected_root, error))?;
        let canonical_root = fs::canonicalize(&expected_root)
            .map_err(|error| StoreError::io(&expected_root, error))?;
        if canonical_root != expected_root {
            return Err(StoreError::RedirectedDataRoot(canonical_root));
        }
        if self.database.exists() {
            let metadata = fs::symlink_metadata(&self.database)
                .map_err(|error| StoreError::io(&self.database, error))?;
            if metadata.file_type().is_symlink() {
                return Err(StoreError::RedirectedDatabase(self.database.clone()));
            }
        }
        fs::create_dir_all(&self.backups).map_err(|error| StoreError::io(&self.backups, error))?;
        Ok(())
    }
}
