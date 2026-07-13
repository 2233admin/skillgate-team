use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::{Result, RuntimeError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathRef {
    pub grant_id: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GrantedPath {
    pub grant_id: String,
    pub root: PathBuf,
    pub path: PathBuf,
}

pub trait PathGrantResolver: Send + Sync {
    fn resolve_file(&self, location: &PathRef) -> Result<GrantedPath>;
    fn resolve_directory(&self, location: &PathRef) -> Result<GrantedPath>;
}

#[derive(Debug, Default, Clone)]
pub struct RootGrantResolver {
    roots: Arc<RwLock<HashMap<String, PathBuf>>>,
}

impl RootGrantResolver {
    pub fn register(&self, grant_id: impl Into<String>, root: impl AsRef<Path>) -> Result<()> {
        let root = canonicalize(root.as_ref())?;
        if !root.is_dir() {
            return Err(RuntimeError::InvalidPathKind(root));
        }
        self.roots
            .write()
            .expect("grant registry lock poisoned")
            .insert(grant_id.into(), root);
        Ok(())
    }

    fn resolve(&self, location: &PathRef, want_directory: bool) -> Result<GrantedPath> {
        validate_relative(&location.relative_path)?;
        let root = self
            .roots
            .read()
            .expect("grant registry lock poisoned")
            .get(&location.grant_id)
            .cloned()
            .ok_or_else(|| RuntimeError::PathNotGranted(location.grant_id.clone()))?;
        let path = canonicalize(&root.join(&location.relative_path))?;
        if !path.starts_with(&root) {
            return Err(RuntimeError::SymlinkEscape(location.relative_path.clone()));
        }
        if path.is_dir() != want_directory || (!want_directory && !path.is_file()) {
            return Err(RuntimeError::InvalidPathKind(path));
        }
        Ok(GrantedPath {
            grant_id: location.grant_id.clone(),
            root,
            path,
        })
    }
}

impl PathGrantResolver for RootGrantResolver {
    fn resolve_file(&self, location: &PathRef) -> Result<GrantedPath> {
        self.resolve(location, false)
    }

    fn resolve_directory(&self, location: &PathRef) -> Result<GrantedPath> {
        self.resolve(location, true)
    }
}

fn validate_relative(value: &str) -> Result<()> {
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(RuntimeError::PathEscape(value.to_string()));
    }
    Ok(())
}

fn canonicalize(path: &Path) -> Result<PathBuf> {
    path.canonicalize()
        .map_err(|error| RuntimeError::PathResolution {
            path: path.to_path_buf(),
            message: error.to_string(),
        })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn grants_resolve_existing_files_and_directories() {
        let temp = tempdir().unwrap();
        fs::create_dir(temp.path().join("project")).unwrap();
        fs::write(temp.path().join("project/agent.md"), "agent").unwrap();
        let grants = RootGrantResolver::default();
        grants.register("root", temp.path()).unwrap();

        let file = grants
            .resolve_file(&PathRef {
                grant_id: "root".into(),
                relative_path: "project/agent.md".into(),
            })
            .unwrap();
        assert!(file.path.is_file());
        assert!(grants
            .resolve_directory(&PathRef {
                grant_id: "root".into(),
                relative_path: "project".into(),
            })
            .unwrap()
            .path
            .is_dir());
    }

    #[test]
    fn rejects_absolute_and_parent_traversal() {
        let grants = RootGrantResolver::default();
        for relative_path in ["../escape", "/absolute"] {
            let error = grants
                .resolve_file(&PathRef {
                    grant_id: "root".into(),
                    relative_path: relative_path.into(),
                })
                .unwrap_err();
            assert!(matches!(error, RuntimeError::PathEscape(_)));
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;

        let granted = tempdir().unwrap();
        let outside = tempdir().unwrap();
        fs::write(outside.path().join("agent.md"), "agent").unwrap();
        symlink(outside.path(), granted.path().join("outside")).unwrap();
        let grants = RootGrantResolver::default();
        grants.register("root", granted.path()).unwrap();
        let error = grants
            .resolve_file(&PathRef {
                grant_id: "root".into(),
                relative_path: "outside/agent.md".into(),
            })
            .unwrap_err();
        assert!(matches!(error, RuntimeError::SymlinkEscape(_)));
    }
}
