use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum RuntimeError {
    #[error("unsupported model {model} for {harness}")]
    UnsupportedModel { harness: String, model: String },
    #[error("CLI {binary} was not found; install it and restart Skillgate")]
    CliNotFound { binary: String },
    #[error("CLI lookup failed for {binary}: {message}")]
    CliLookup { binary: String, message: String },
    #[error("resolved CLI path is invalid: {0}")]
    InvalidExecutable(PathBuf),
    #[error("path grant is unknown: {0}")]
    PathNotGranted(String),
    #[error("path must be relative and cannot traverse its grant: {0}")]
    PathEscape(String),
    #[error("resolved path escapes its grant: {0}")]
    SymlinkEscape(String),
    #[error("path has the wrong kind: {0}")]
    InvalidPathKind(PathBuf),
    #[error("path resolution failed for {path}: {message}")]
    PathResolution { path: PathBuf, message: String },
    #[error("prepared launch was not found or was already consumed")]
    PreparedLaunchNotFound,
    #[error("prepared launch expired")]
    PreparedLaunchExpired,
    #[error("invalid terminal size {columns}x{rows}")]
    InvalidTerminalSize { columns: u16, rows: u16 },
    #[error("terminal session was not found: {0}")]
    TerminalNotFound(String),
    #[error("terminal session is already closed: {0}")]
    TerminalClosed(String),
    #[error("PTY operation failed: {0}")]
    Pty(String),
    #[error("process start failed: {0}")]
    ProcessStart(String),
    #[error("process cleanup failed: {0}")]
    ProcessCleanup(String),
}

pub type Result<T> = std::result::Result<T, RuntimeError>;
