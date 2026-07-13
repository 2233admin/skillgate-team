use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Skillgate data root is redirected outside the canonical home: {0}")]
    RedirectedDataRoot(PathBuf),
    #[error("Skillgate database path must not be a symbolic link or reparse redirect: {0}")]
    RedirectedDatabase(PathBuf),
    #[error("the Skillgate database writer is busy{owner}")]
    WriterBusy { owner: String },
    #[error("database schema version {found} is newer than supported version {supported}")]
    UnsupportedSchema { found: i64, supported: i64 },
    #[error("database integrity check failed: {0}")]
    Integrity(String),
    #[error("database foreign-key check failed: {0}")]
    ForeignKey(String),
    #[error("invalid preference value for {key}: {message}")]
    InvalidPreference { key: String, message: String },
    #[error("remote server not found: {0}")]
    RemoteNotFound(String),
    #[error("I/O error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl StoreError {
    pub(crate) fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;
