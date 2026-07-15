use crate::error::{AppError, AppErrorCategory, AppErrorCode, AppResult};
use crate::model::{PathRef, RootGrant};
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

/// A native path that was resolved by the host-owned grant registry.
///
/// This type is deliberately not serializable, so native paths cannot cross
/// the renderer wire boundary by accident.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedPath {
    path: PathBuf,
}

impl AuthorizedPath {
    pub fn as_path(&self) -> &Path {
        &self.path
    }
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

    /// Resolves an existing file or directory after rejecting absolute paths,
    /// parent traversal, and link targets outside the granted root.
    pub fn authorize_existing(&self, location: &PathRef) -> AppResult<AuthorizedPath> {
        let root = self.resolve_root_path(&location.grant_id)?;
        let relative = validate_relative_path(&location.relative_path, true)?;
        let candidate = root.join(relative);
        let canonical = std::fs::canonicalize(&candidate)
            .map_err(|error| AppError::from_io(&error, "granted path resolution"))?;
        ensure_contained(&root, &canonical)?;
        Ok(AuthorizedPath { path: canonical })
    }

    /// Resolves a mutation target. The target may be absent, but its parent
    /// must already exist and remain inside the grant after canonicalization.
    pub fn authorize_target(&self, location: &PathRef) -> AppResult<AuthorizedPath> {
        let root = self.resolve_root_path(&location.grant_id)?;
        let relative = validate_relative_path(&location.relative_path, false)?;
        let candidate = root.join(relative);

        if candidate.exists() || std::fs::symlink_metadata(&candidate).is_ok() {
            let canonical = std::fs::canonicalize(&candidate)
                .map_err(|error| AppError::from_io(&error, "granted mutation target"))?;
            ensure_contained(&root, &canonical)?;
            return Ok(AuthorizedPath { path: canonical });
        }

        let parent = candidate.parent().ok_or_else(|| {
            AppError::new(
                AppErrorCode::PathEscape,
                AppErrorCategory::Authorization,
                "mutation target has no granted parent",
            )
        })?;
        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|error| AppError::from_io(&error, "granted mutation parent"))?;
        ensure_contained(&root, &canonical_parent)?;
        let file_name = candidate.file_name().ok_or_else(|| {
            AppError::new(
                AppErrorCode::InvalidArgument,
                AppErrorCategory::Validation,
                "relativePath must identify a file or directory",
            )
        })?;
        Ok(AuthorizedPath {
            path: canonical_parent.join(file_name),
        })
    }

    pub(crate) fn resolve_root_path(&self, grant_id: &str) -> AppResult<PathBuf> {
        Ok(self.resolve_root(grant_id)?.canonical_path)
    }

    #[cfg(test)]
    fn authorize_relative(&self, grant_id: &str, relative: &str) -> AppResult<PathBuf> {
        self.authorize_existing(&PathRef {
            grant_id: grant_id.to_string(),
            relative_path: relative.to_string(),
        })
        .map(|authorized| authorized.path)
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

fn validate_relative_path(relative: &str, allow_empty: bool) -> AppResult<&Path> {
    use std::path::Component;

    let relative_path = Path::new(relative);
    if (!allow_empty && relative.is_empty())
        || relative_path.is_absolute()
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
    Ok(relative_path)
}

fn ensure_contained(root: &Path, candidate: &Path) -> AppResult<()> {
    if candidate.starts_with(root) {
        return Ok(());
    }
    Err(AppError::new(
        AppErrorCode::SymlinkEscape,
        AppErrorCategory::Authorization,
        "resolved path escapes the granted root through a link",
    ))
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

    #[test]
    fn production_authorization_resolves_only_grant_relative_existing_paths() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("inside.md"), "safe").unwrap();
        let registry = GrantRegistry::new();
        registry
            .register_host_root("root", temp.path(), "Test", false)
            .unwrap();

        let authorized = registry
            .authorize_existing(&crate::PathRef {
                grant_id: "root".into(),
                relative_path: "inside.md".into(),
            })
            .unwrap();
        assert_eq!(
            authorized.as_path(),
            std::fs::canonicalize(temp.path().join("inside.md")).unwrap()
        );

        let escaped = registry
            .authorize_existing(&crate::PathRef {
                grant_id: "root".into(),
                relative_path: "../outside.md".into(),
            })
            .unwrap_err();
        assert_eq!(escaped.code, AppErrorCode::PathEscape);
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
