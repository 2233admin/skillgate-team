use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use uuid::Uuid;

use crate::{
    AgentHarness, CliResolver, HarnessModel, HarnessPolicy, PathGrantResolver, PathRef, Result,
    RuntimeError,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentLaunchRequest {
    pub agent: PathRef,
    pub cwd: PathRef,
    pub harness: AgentHarness,
    pub model: HarnessModel,
    pub prompt: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedLaunch {
    pub executable: PathBuf,
    pub argv: Vec<String>,
    pub cwd: PathBuf,
    pub harness: AgentHarness,
    pub model: HarnessModel,
    pub agent_slug: String,
    pub normalized_prompt: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PreparedLaunchDescriptor {
    pub prepared_launch_id: String,
    pub launch: PreparedLaunch,
    pub expires_at: SystemTime,
}

#[derive(Clone)]
pub struct PreparedLaunchStore {
    grants: Arc<dyn PathGrantResolver>,
    resolver: Arc<dyn CliResolver>,
    ttl: Duration,
    entries: Arc<Mutex<HashMap<String, StoredLaunch>>>,
}

#[derive(Debug, Clone)]
struct StoredLaunch {
    launch: PreparedLaunch,
    expires_at: Instant,
}

impl std::fmt::Debug for PreparedLaunchStore {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PreparedLaunchStore")
            .field("ttl", &self.ttl)
            .field(
                "entry_count",
                &self
                    .entries
                    .lock()
                    .expect("launch store lock poisoned")
                    .len(),
            )
            .finish_non_exhaustive()
    }
}

impl PreparedLaunchStore {
    pub fn new(
        grants: Arc<dyn PathGrantResolver>,
        resolver: Arc<dyn CliResolver>,
        ttl: Duration,
    ) -> Self {
        Self {
            grants,
            resolver,
            ttl,
            entries: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn prepare(&self, request: AgentLaunchRequest) -> Result<PreparedLaunchDescriptor> {
        HarnessPolicy::for_harness(request.harness).validate(request.model)?;
        let agent = self.grants.resolve_file(&request.agent)?;
        let cwd = self.grants.resolve_directory(&request.cwd)?;
        let executable = self.resolver.resolve(request.harness)?;
        let agent_slug = agent
            .path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .filter(|stem| !stem.is_empty())
            .unwrap_or("agent")
            .to_string();
        let normalized_prompt = request
            .prompt
            .as_deref()
            .map(str::trim)
            .filter(|prompt| !prompt.is_empty())
            .map(str::to_string);
        let argv = build_argv(
            request.harness,
            request.model,
            &agent_slug,
            normalized_prompt.as_deref(),
        );
        let launch = PreparedLaunch {
            executable,
            argv,
            cwd: cwd.path,
            harness: request.harness,
            model: request.model,
            agent_slug,
            normalized_prompt,
        };
        let prepared_launch_id = Uuid::new_v4().to_string();
        let expires_at = Instant::now() + self.ttl;
        self.entries
            .lock()
            .expect("launch store lock poisoned")
            .insert(
                prepared_launch_id.clone(),
                StoredLaunch {
                    launch: launch.clone(),
                    expires_at,
                },
            );
        Ok(PreparedLaunchDescriptor {
            prepared_launch_id,
            launch,
            expires_at: SystemTime::now() + self.ttl,
        })
    }

    pub fn consume(&self, prepared_launch_id: &str) -> Result<PreparedLaunch> {
        let stored = self
            .entries
            .lock()
            .expect("launch store lock poisoned")
            .remove(prepared_launch_id)
            .ok_or(RuntimeError::PreparedLaunchNotFound)?;
        if Instant::now() > stored.expires_at {
            return Err(RuntimeError::PreparedLaunchExpired);
        }
        Ok(stored.launch)
    }

    pub fn purge_expired(&self) -> usize {
        let now = Instant::now();
        let mut entries = self.entries.lock().expect("launch store lock poisoned");
        let before = entries.len();
        entries.retain(|_, entry| entry.expires_at >= now);
        before - entries.len()
    }
}

fn build_argv(
    harness: AgentHarness,
    model: HarnessModel,
    agent_slug: &str,
    prompt: Option<&str>,
) -> Vec<String> {
    match harness {
        AgentHarness::ClaudeCode => {
            let mut args = vec![
                "--agent".into(),
                agent_slug.into(),
                "--model".into(),
                model.to_string(),
            ];
            if let Some(prompt) = prompt {
                args.push(prompt.into());
            }
            args
        }
        AgentHarness::Cursor => {
            let mut args = vec!["chat".into()];
            if model != HarnessModel::Auto {
                args.extend(["--model".into(), model.to_string()]);
            }
            args.push(agent_prompt("Use the", "subagent", agent_slug, prompt));
            args
        }
        AgentHarness::Codex => vec![
            "--model".into(),
            model.to_string(),
            agent_prompt("Spawn", "and wait for my instructions", agent_slug, prompt),
        ],
    }
}

fn agent_prompt(prefix: &str, suffix: &str, slug: &str, prompt: Option<&str>) -> String {
    let base = format!("{prefix} {slug} {suffix}");
    prompt.map_or(base.clone(), |prompt| format!("{base}. {prompt}"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;
    use crate::RootGrantResolver;

    #[derive(Debug)]
    struct FakeResolver(PathBuf);

    impl CliResolver for FakeResolver {
        fn resolve(&self, _harness: AgentHarness) -> Result<PathBuf> {
            Ok(self.0.clone())
        }
    }

    fn fixture(ttl: Duration) -> (PreparedLaunchStore, tempfile::TempDir) {
        let temp = tempdir().unwrap();
        fs::create_dir_all(temp.path().join("project/.codex/agents")).unwrap();
        fs::write(
            temp.path().join("project/.codex/agents/reviewer.md"),
            "agent",
        )
        .unwrap();
        let grants = RootGrantResolver::default();
        grants.register("root", temp.path()).unwrap();
        let store = PreparedLaunchStore::new(
            Arc::new(grants),
            Arc::new(FakeResolver(temp.path().join("codex"))),
            ttl,
        );
        (store, temp)
    }

    fn request(
        harness: AgentHarness,
        model: HarnessModel,
        prompt: Option<&str>,
    ) -> AgentLaunchRequest {
        AgentLaunchRequest {
            agent: PathRef {
                grant_id: "root".into(),
                relative_path: "project/.codex/agents/reviewer.md".into(),
            },
            cwd: PathRef {
                grant_id: "root".into(),
                relative_path: "project".into(),
            },
            harness,
            model,
            prompt: prompt.map(str::to_string),
        }
    }

    #[test]
    fn builds_exact_structured_argv_and_trims_optional_prompt() {
        let (store, _temp) = fixture(Duration::from_secs(30));
        let cursor = store
            .prepare(request(
                AgentHarness::Cursor,
                HarnessModel::Auto,
                Some("  review this  "),
            ))
            .unwrap();
        assert_eq!(
            cursor.launch.argv,
            ["chat", "Use the reviewer subagent. review this"]
        );
        let claude = store
            .prepare(request(
                AgentHarness::ClaudeCode,
                HarnessModel::Opus48,
                Some("go"),
            ))
            .unwrap();
        assert_eq!(
            claude.launch.argv,
            ["--agent", "reviewer", "--model", "opus-4.8", "go"]
        );
        let codex = store
            .prepare(request(AgentHarness::Codex, HarnessModel::O3, None))
            .unwrap();
        assert_eq!(
            codex.launch.argv,
            [
                "--model",
                "o3",
                "Spawn reviewer and wait for my instructions"
            ]
        );
    }

    #[test]
    fn prompt_injection_remains_one_opaque_argument() {
        let (store, _temp) = fixture(Duration::from_secs(30));
        let marker = "\"; touch /tmp/pwned; $(whoami) & calc.exe";
        let prepared = store
            .prepare(request(AgentHarness::Codex, HarnessModel::O3, Some(marker)))
            .unwrap();
        assert_eq!(prepared.launch.argv.len(), 3);
        assert!(prepared.launch.argv[2].ends_with(marker));
    }

    #[test]
    fn prepared_launch_is_single_consume() {
        let (store, _temp) = fixture(Duration::from_secs(30));
        let prepared = store
            .prepare(request(AgentHarness::Codex, HarnessModel::O3, None))
            .unwrap();
        assert!(store.consume(&prepared.prepared_launch_id).is_ok());
        assert!(matches!(
            store.consume(&prepared.prepared_launch_id),
            Err(RuntimeError::PreparedLaunchNotFound)
        ));
    }

    #[test]
    fn prepared_launch_expires_and_is_removed() {
        let (store, _temp) = fixture(Duration::ZERO);
        let prepared = store
            .prepare(request(AgentHarness::Codex, HarnessModel::O3, None))
            .unwrap();
        std::thread::sleep(Duration::from_millis(2));
        assert!(matches!(
            store.consume(&prepared.prepared_launch_id),
            Err(RuntimeError::PreparedLaunchExpired)
        ));
        assert!(matches!(
            store.consume(&prepared.prepared_launch_id),
            Err(RuntimeError::PreparedLaunchNotFound)
        ));
    }
}
