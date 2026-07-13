use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppErrorCode {
    InvalidArgument,
    CapabilityUnavailable,
    PathNotGranted,
    PathEscape,
    SymlinkEscape,
    PermissionDenied,
    NotFound,
    Internal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppErrorCategory {
    Validation,
    Unavailable,
    Authorization,
    NotFound,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: AppErrorCode,
    pub message: String,
    pub category: AppErrorCategory,
    pub retryable: bool,
    #[serde(skip_serializing_if = "BTreeMap::is_empty", default)]
    pub details: BTreeMap<String, String>,
}

impl AppError {
    pub fn new(code: AppErrorCode, category: AppErrorCategory, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            category,
            retryable: false,
            details: BTreeMap::new(),
        }
    }

    pub fn with_detail(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.details.insert(key.into(), value.into());
        self
    }

    pub(crate) fn from_io(error: &std::io::Error, operation: &'static str) -> Self {
        let (code, category) = match error.kind() {
            std::io::ErrorKind::NotFound => (AppErrorCode::NotFound, AppErrorCategory::NotFound),
            std::io::ErrorKind::PermissionDenied => (
                AppErrorCode::PermissionDenied,
                AppErrorCategory::Authorization,
            ),
            _ => (AppErrorCode::Internal, AppErrorCategory::Internal),
        };

        Self::new(code, category, format!("{operation} failed"))
            .with_detail("ioKind", format!("{:?}", error.kind()))
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}
