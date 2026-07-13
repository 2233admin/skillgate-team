use crate::error::{AppError, AppErrorCategory, AppErrorCode, AppResult};
use crate::model::RootGrant;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone)]
struct GrantedRoot {
    wire: RootGrant,
    canonical_path: PathBuf,
}

/// Host-owned authority store. Native paths are intentionally private and the
/// type is not serializable.
#[derive(Debug, Clone, Default)]
pub struct GrantRegistry {
    roots: Arc<RwLock<BTreeMap<String, GrantedRoot>>>,
}

impl GrantRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a path selected by trusted host UI. Renderer-provided strings
    /// must never be passed to this method.
    pub fn register_host_root(
        &self,
        grant_id: impl Into<String>,
        path: impl AsRef<Path>,
        display_name: impl Into<String>,
        persisted: bool,
    ) -> AppResult<RootGrant> {
        let grant_id = grant_id.into();
        if grant_id.trim().is_empty() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "grantId must not be empty",
            ));
        }

        let canonical_path = std::fs::canonicalize(path.as_ref())
            .map_err(|error| AppError::from_io(&error, "root grant registration"))?;
        if !canonical_path.is_dir() {
            return Err(AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "selected root is not a directory",
            ));
        }

        let wire = RootGrant {
            grant_id: grant_id.clone(),
            display_name: display_name.into(),
            persisted,
        };
        let granted = GrantedRoot {
            wire: wire.clone(),
            canonical_path,
        };
        self.roots
            .write()
            .map_err(|_| lock_error())?
            .insert(grant_id, granted);
        Ok(wire)
    }

    pub fn get(&self, grant_id: &str) -> AppResult<RootGrant> {
        Ok(self.resolve_root(grant_id)?.wire)
    }

    pub(crate) fn resolve_root_path(&self, grant_id: &str) -> AppResult<PathBuf> {
        Ok(self.resolve_root(grant_id)?.canonical_path)
    }

    #[cfg(test)]
    fn authorize_relative(&self, grant_id: &str, relative: &str) -> AppResult<PathBuf> {
        use std::path::Component;
        let root = self.resolve_root_path(grant_id)?;
        let relative_path = Path::new(relative);
        if relative_path.is_absolute()
            || relative_path.components().any(|component| {
                matches!(
                    component,
                    Component::ParentDir | Component::RootDir | Component::Prefix(_)
                )
            })
        {
            return Err(AppError::new(
                AppErrorCode::PathEscape,
                AppErrorCategory::Authorization,
                "relativePath escapes the granted root",
            ));
        }

        let candidate = root.join(relative_path);
        let canonical = std::fs::canonicalize(&candidate)
            .map_err(|error| AppError::from_io(&error, "granted path resolution"))?;
        if !canonical.starts_with(&root) {
            return Err(AppError::new(
                AppErrorCode::SymlinkEscape,
                AppErrorCategory::Authorization,
                "resolved path escapes the granted root through a link",
            ));
        }
        Ok(canonical)
    }

    fn resolve_root(&self, grant_id: &str) -> AppResult<GrantedRoot> {
        self.roots
            .read()
            .map_err(|_| lock_error())?
            .get(grant_id)
            .cloned()
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::PathNotGranted,
                    AppErrorCategory::Authorization,
                    "grantId is unknown or expired",
                )
            })
    }
}

fn lock_error() -> AppError {
    AppError::new(
        AppErrorCode::Internal,
        AppErrorCategory::Internal,
        "grant registry is unavailable",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_and_absolute_paths() {
        let temp = tempfile::tempdir().unwrap();
        let registry = GrantRegistry::new();
        registry
            .register_host_root("root", temp.path(), "Test", false)
            .unwrap();

        assert_eq!(
            registry
                .authorize_relative("root", "../secret")
                .unwrap_err()
                .code,
            AppErrorCode::PathEscape
        );
        assert_eq!(
            registry
                .authorize_relative("root", temp.path().to_string_lossy().as_ref())
                .unwrap_err()
                .code,
            AppErrorCode::PathEscape
        );
    }

    #[test]
    fn rejects_unknown_grant() {
        let registry = GrantRegistry::new();
        assert_eq!(
            registry.get("missing").unwrap_err().code,
            AppErrorCode::PathNotGranted
        );
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "secret").unwrap();
        symlink(outside.path(), root.path().join("outside")).unwrap();
        let registry = GrantRegistry::new();
        registry
            .register_host_root("root", root.path(), "Test", false)
            .unwrap();

        assert_eq!(
            registry
                .authorize_relative("root", "outside/secret")
                .unwrap_err()
                .code,
            AppErrorCode::SymlinkEscape
        );
    }
}
