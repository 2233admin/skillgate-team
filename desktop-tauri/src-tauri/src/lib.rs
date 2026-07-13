use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use skillgate_catalog::{
    AppError, AppErrorCategory, AppErrorCode, CatalogService, GrantRegistry, ListCatalogInput,
    PathRef,
};
use skillgate_files::FileService;
use skillgate_runtime::{
    AgentHarness, AgentLaunchRequest, CliResolver, GrantedPath, HarnessModel, HarnessPolicy,
    PathGrantResolver, PreparedLaunchStore, RuntimeError, SystemCliResolver, TerminalEvent,
    TerminalEventKind, TerminalManager, TerminalSize,
};
use skillgate_store::{FavoriteToggle, RemoteServer as StoredRemoteServer, Store, StorePaths};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestMeta {
    request_id: String,
    correlation_id: String,
    #[serde(default)]
    idempotency_key: Option<String>,
    #[serde(default)]
    deadline_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResponseMeta {
    request_id: String,
    correlation_id: String,
    completed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    revision: Option<String>,
}

impl ResponseMeta {
    fn new(meta: &RequestMeta, revision: Option<String>) -> Self {
        Self {
            request_id: meta.request_id.clone(),
            correlation_id: meta.correlation_id.clone(),
            completed_at: now_rfc3339(),
            revision,
        }
    }
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum AppResult<T> {
    Ok {
        ok: bool,
        data: T,
        meta: ResponseMeta,
    },
    Err {
        ok: bool,
        error: AppError,
        meta: ResponseMeta,
    },
}

fn success<T>(data: T, meta: &RequestMeta, revision: Option<String>) -> AppResult<T> {
    AppResult::Ok {
        ok: true,
        data,
        meta: ResponseMeta::new(meta, revision),
    }
}

fn failure<T>(error: AppError, meta: &RequestMeta) -> AppResult<T> {
    AppResult::Err {
        ok: false,
        error,
        meta: ResponseMeta::new(meta, None),
    }
}

fn from_core<T>(result: skillgate_catalog::AppResult<T>, meta: &RequestMeta) -> AppResult<T> {
    match result {
        Ok(data) => success(data, meta, None),
        Err(error) => failure(error, meta),
    }
}

fn invalid_argument(message: impl Into<String>) -> AppError {
    AppError::new(
        AppErrorCode::InvalidArgument,
        AppErrorCategory::Validation,
        message,
    )
}

#[allow(clippy::result_large_err)] // The fallback request envelope must accompany validation errors.
fn decode_meta(value: Value) -> Result<RequestMeta, (RequestMeta, AppError)> {
    let fallback = RequestMeta {
        request_id: value
            .get("requestId")
            .and_then(Value::as_str)
            .unwrap_or("invalid-request")
            .to_string(),
        correlation_id: value
            .get("correlationId")
            .and_then(Value::as_str)
            .unwrap_or("invalid-correlation")
            .to_string(),
        idempotency_key: value
            .get("idempotencyKey")
            .and_then(Value::as_str)
            .map(str::to_string),
        deadline_ms: value.get("deadlineMs").and_then(Value::as_u64),
    };
    serde_json::from_value(value).map_err(|_| {
        (
            fallback,
            invalid_argument("request metadata does not match AppAPI v1"),
        )
    })
}

fn decode_input<T: DeserializeOwned>(value: Value, operation: &str) -> Result<T, AppError> {
    serde_json::from_value(value)
        .map_err(|_| invalid_argument(format!("{operation} input does not match AppAPI v1")))
}

#[derive(Debug)]
struct CatalogState {
    service: CatalogService,
}

impl CatalogState {
    fn new(grants: GrantRegistry) -> Self {
        Self {
            service: CatalogService::new(grants),
        }
    }
}

#[derive(Debug)]
struct FileState {
    service: FileService,
}

#[derive(Debug, Clone)]
struct CatalogGrantAdapter {
    grants: GrantRegistry,
}

impl PathGrantResolver for CatalogGrantAdapter {
    fn resolve_file(
        &self,
        location: &skillgate_runtime::PathRef,
    ) -> skillgate_runtime::Result<GrantedPath> {
        self.resolve(location, false)
    }

    fn resolve_directory(
        &self,
        location: &skillgate_runtime::PathRef,
    ) -> skillgate_runtime::Result<GrantedPath> {
        self.resolve(location, true)
    }
}

impl CatalogGrantAdapter {
    fn resolve(
        &self,
        location: &skillgate_runtime::PathRef,
        directory: bool,
    ) -> skillgate_runtime::Result<GrantedPath> {
        let wire = PathRef {
            grant_id: location.grant_id.clone(),
            relative_path: location.relative_path.clone(),
        };
        let authorized = self.grants.authorize_existing(&wire).map_err(|error| {
            RuntimeError::PathResolution {
                path: std::path::PathBuf::from(&location.relative_path),
                message: error.to_string(),
            }
        })?;
        let path = authorized.as_path().to_path_buf();
        if path.is_dir() != directory || (!directory && !path.is_file()) {
            return Err(RuntimeError::InvalidPathKind(path));
        }
        Ok(GrantedPath {
            grant_id: location.grant_id.clone(),
            root: path.clone(),
            path,
        })
    }
}

#[derive(Debug)]
struct RuntimeState {
    launches: PreparedLaunchStore,
    terminals: TerminalManager,
}

#[derive(Debug, Clone)]
struct EventSubscription {
    kind: String,
    terminal_id: Option<String>,
}

#[derive(Debug, Default)]
struct EventState {
    subscriptions: Mutex<BTreeMap<String, EventSubscription>>,
    sequences: Mutex<BTreeMap<String, u64>>,
}

struct UpdaterState {
    pending: Mutex<Option<Update>>,
    state: Arc<Mutex<Value>>,
}

struct StoreState {
    store: Mutex<Store>,
}

impl std::fmt::Debug for UpdaterState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("UpdaterState")
            .finish_non_exhaustive()
    }
}

impl UpdaterState {
    fn new() -> Self {
        Self {
            pending: Mutex::new(None),
            state: Arc::new(Mutex::new(update_state("idle", None, None))),
        }
    }

    fn replace_state(&self, value: Value) {
        if let Ok(mut state) = self.state.lock() {
            *state = value;
        }
    }

    fn current(&self) -> Value {
        self.state
            .lock()
            .map(|state| state.clone())
            .unwrap_or_else(|_| update_state("error", None, Some("updater state is unavailable")))
    }
}

fn update_state(status: &str, available_version: Option<&str>, message: Option<&str>) -> Value {
    let mut state = json!({
        "status": status,
        "version": env!("CARGO_PKG_VERSION")
    });
    if let Some(version) = available_version {
        state["availableVersion"] = json!(version);
    }
    if let Some(message) = message {
        state["message"] = json!(message);
    }
    state
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WireEvent {
    kind: String,
    stream: String,
    subscription_id: String,
    sequence: u64,
    emitted_at: String,
    payload: Value,
}

impl EventState {
    fn emit_terminal(&self, app: &tauri::AppHandle, event: TerminalEvent) {
        let subscriptions = match self.subscriptions.lock() {
            Ok(subscriptions) => subscriptions.clone(),
            Err(_) => return,
        };
        let terminal_id = event.terminal_id.clone();
        let (kind, payload) = match event.kind {
            TerminalEventKind::Output { data } => (
                "terminal.output",
                json!({ "terminalId": terminal_id, "data": data }),
            ),
            TerminalEventKind::Exit { exit_code, signal } => (
                "terminal.exit",
                json!({ "terminalId": terminal_id, "exitCode": exit_code, "signal": signal }),
            ),
        };
        for (subscription_id, subscription) in subscriptions {
            if subscription.kind != kind
                || subscription
                    .terminal_id
                    .as_deref()
                    .is_some_and(|id| id != event.terminal_id)
            {
                continue;
            }
            let sequence = match self.sequences.lock() {
                Ok(mut sequences) => {
                    let sequence = sequences.entry(subscription_id.clone()).or_default();
                    *sequence += 1;
                    *sequence
                }
                Err(_) => continue,
            };
            let wire = WireEvent {
                kind: kind.to_string(),
                stream: format!("terminal:{}", event.terminal_id),
                subscription_id,
                sequence,
                emitted_at: now_rfc3339(),
                payload: payload.clone(),
            };
            let _ = app.emit("skillgate://app-event", wire);
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectRootInput {
    source: String,
    #[serde(default)]
    previous_grant_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanCatalogInput {
    grant_id: String,
    #[serde(default)]
    force: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetCatalogItemInput {
    grant_id: String,
    item_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocationInput {
    location: PathRef,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupportingFilesInput {
    skill: PathRef,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadSupportingFileInput {
    skill: PathRef,
    relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteFileInput {
    location: PathRef,
    content: String,
    #[serde(default)]
    expected_revision: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListDirectoryInput {
    directory: PathRef,
    #[serde(default)]
    depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteFileInput {
    location: PathRef,
    #[serde(default)]
    expected_revision: Option<String>,
    recovery: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoverFileInput {
    recovery_token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupportingFile {
    relative_path: String,
    size: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSelection {
    item_id: String,
    canonical_item_id: String,
    name: String,
    slug: String,
    platform: String,
    location: PathRef,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrepareAgentInput {
    agent: AgentSelection,
    harness: AgentHarness,
    model: HarnessModel,
    #[serde(default)]
    prompt: Option<String>,
    cwd: PathRef,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateTerminalInput {
    prepared_launch_id: String,
    columns: u16,
    rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalInput {
    terminal_id: String,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResizeTerminalInput {
    terminal_id: String,
    columns: u16,
    rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalIdInput {
    terminal_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscribeEventInput {
    kind: String,
    #[serde(default)]
    terminal_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnsubscribeEventInput {
    subscription_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferenceGetInput {
    key: String,
    default_value: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreferenceSetInput {
    key: String,
    value: Value,
}

#[derive(Debug, Deserialize)]
struct FavoriteInput {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateRemoteInput {
    label: String,
    host: String,
    #[serde(default = "default_ssh_port")]
    port: u16,
    username: String,
    #[serde(default = "default_skills_base_path")]
    skills_base_path: String,
    #[serde(default)]
    ssh_key_ref: Option<PathRef>,
}

#[derive(Debug, Deserialize)]
struct RemoteIdInput {
    id: String,
}

#[derive(Debug, Deserialize)]
struct UpdateRemoteInput {
    id: String,
    fields: Value,
}

fn default_ssh_port() -> u16 {
    22
}

fn default_skills_base_path() -> String {
    "~/.agents/skills".to_string()
}

fn runtime_error(error: RuntimeError) -> AppError {
    let (code, category) = match &error {
        RuntimeError::UnsupportedModel { .. } | RuntimeError::InvalidTerminalSize { .. } => {
            (AppErrorCode::InvalidArgument, AppErrorCategory::Validation)
        }
        RuntimeError::PathNotGranted(_) => (
            AppErrorCode::PathNotGranted,
            AppErrorCategory::Authorization,
        ),
        RuntimeError::PathEscape(_) => (AppErrorCode::PathEscape, AppErrorCategory::Authorization),
        RuntimeError::SymlinkEscape(_) => {
            (AppErrorCode::SymlinkEscape, AppErrorCategory::Authorization)
        }
        RuntimeError::CliNotFound { .. }
        | RuntimeError::CliLookup { .. }
        | RuntimeError::InvalidExecutable(_)
        | RuntimeError::ProcessStart(_) => (
            AppErrorCode::ProcessStartFailed,
            AppErrorCategory::Unavailable,
        ),
        RuntimeError::PreparedLaunchNotFound
        | RuntimeError::PreparedLaunchExpired
        | RuntimeError::TerminalNotFound(_)
        | RuntimeError::TerminalClosed(_) => {
            (AppErrorCode::InvalidState, AppErrorCategory::Conflict)
        }
        _ => (AppErrorCode::Internal, AppErrorCategory::Internal),
    };
    AppError::new(code, category, error.to_string())
}

fn store_error(error: impl std::fmt::Display) -> AppError {
    AppError::new(
        AppErrorCode::Internal,
        AppErrorCategory::Internal,
        format!("local persistence failed: {error}"),
    )
}

fn with_store<T>(
    state: &State<'_, StoreState>,
    operation: impl FnOnce(&Store) -> Result<T, skillgate_store::StoreError>,
) -> Result<T, AppError> {
    let store = state
        .store
        .lock()
        .map_err(|_| store_error("store lock is poisoned"))?;
    operation(&store).map_err(store_error)
}

fn remote_to_wire(server: StoredRemoteServer) -> Value {
    let ssh_key_ref = server
        .ssh_key_path
        .as_deref()
        .and_then(|value| serde_json::from_str::<PathRef>(value).ok());
    json!({
        "id": server.id,
        "label": server.label,
        "host": server.host,
        "port": server.port,
        "username": server.username,
        "skillsBasePath": server.skills_base_path,
        "sshKeyRef": ssh_key_ref,
        "lastSyncAt": server.last_sync_at,
        "lastSyncError": server.last_sync_error,
        "createdAt": server.created_at.unwrap_or_else(now_rfc3339)
    })
}

fn runtime_path(location: &PathRef) -> skillgate_runtime::PathRef {
    skillgate_runtime::PathRef {
        grant_id: location.grant_id.clone(),
        relative_path: location.relative_path.clone(),
    }
}

fn system_time_rfc3339(value: std::time::SystemTime) -> String {
    let seconds = value
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    OffsetDateTime::from_unix_timestamp(seconds)
        .unwrap_or(OffsetDateTime::UNIX_EPOCH)
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn mutation_key(meta: &RequestMeta) -> Result<&str, AppError> {
    meta.idempotency_key
        .as_deref()
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| invalid_argument("mutation requests require meta.idempotencyKey"))
}

fn supporting_location(skill: &PathRef, relative_path: &str) -> Result<PathRef, AppError> {
    use std::path::{Component, Path};
    let relative = Path::new(relative_path);
    if relative_path.is_empty()
        || relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(AppError::new(
            AppErrorCode::PathEscape,
            AppErrorCategory::Authorization,
            "supporting file path escapes the skill directory",
        ));
    }
    let parent = Path::new(&skill.relative_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    Ok(PathRef {
        grant_id: skill.grant_id.clone(),
        relative_path: parent.join(relative).to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn app_describe(_input: Value, meta: Value) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    success(
        json!({
            "contract": { "major": 1, "minor": 0 },
            "implementation": {
                "name": "Skillgate",
                "version": env!("CARGO_PKG_VERSION"),
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH
            },
            "capabilities": {
                "app.identity": {
                    "state": "available",
                    "version": "1.0",
                    "operations": ["describe"]
                },
                "catalog.local": {
                    "state": "degraded",
                    "version": "1.0",
                    "operations": ["selectRoot", "scan", "list", "search", "getItem"],
                    "reason": {
                        "code": "CAPABILITY_UNAVAILABLE",
                        "message": "Live catalog watch is scheduled after the M1 read-only slice.",
                        "category": "unavailable",
                        "retryable": false
                    }
                },
                "files.workspace": {
                    "state": "available",
                    "version": "1.0",
                    "operations": ["readSkillContent", "listSupportingFiles", "readSupportingFile", "writeSkillContent", "listDirectory", "tree", "stat", "delete", "recover", "reveal"]
                },
                "agents.launch": {
                    "state": "available",
                    "version": "1.0",
                    "operations": ["getHarnessPolicy", "prepare"]
                },
                "terminals.pty": {
                    "state": "degraded",
                    "version": "1.0",
                    "operations": ["create", "write", "resize", "close"],
                    "reason": {
                        "code": "CAPABILITY_UNAVAILABLE",
                        "message": "Windows descendant Job Object cleanup and packaged macOS/Linux smoke remain release gates.",
                        "category": "unavailable",
                        "retryable": false
                    }
                },
                "updates.signed": {
                    "state": "degraded",
                    "version": "1.0",
                    "operations": ["getState", "check", "install"],
                    "reason": {
                        "code": "CAPABILITY_UNAVAILABLE",
                        "message": "Updater checks are available only in release builds carrying the Skillgate public key.",
                        "category": "unavailable",
                        "retryable": false
                    }
                },
                "preferences.local": {
                    "state": "available",
                    "version": "1.0",
                    "operations": ["get", "set", "all", "listFavorites", "toggleFavorite"]
                },
                "remotes.ssh": {
                    "state": "degraded",
                    "version": "1.0",
                    "operations": ["list", "create", "update", "delete", "count"],
                    "reason": {
                        "code": "CAPABILITY_UNAVAILABLE",
                        "message": "Remote profiles persist locally; SSH transport and sync remain disabled until packaged transport verification passes.",
                        "category": "unavailable",
                        "retryable": false
                    }
                }
            }
        }),
        &meta,
        None,
    )
}

#[tauri::command]
fn catalog_select_root(
    input: Value,
    meta: Value,
    state: State<'_, CatalogState>,
    app: tauri::AppHandle,
) -> AppResult<Option<skillgate_catalog::RootGrant>> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: SelectRootInput = match decode_input(input, "catalog.selectRoot") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if let Some(previous) = input.previous_grant_id.as_deref() {
        if let Ok(grant) = state.service.grants().get(previous) {
            return success(Some(grant), &meta, None);
        }
    }

    let (grant_id, path, display_name, persisted) = match input.source.as_str() {
        "home" => {
            let home = std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(std::path::PathBuf::from);
            let Some(home) = home else {
                return failure(
                    AppError::new(
                        AppErrorCode::NotFound,
                        AppErrorCategory::NotFound,
                        "home directory is unavailable",
                    ),
                    &meta,
                );
            };
            ("home".to_string(), home, "Home".to_string(), true)
        }
        "picker" => {
            let Some(selected) = app.dialog().file().blocking_pick_folder() else {
                return success(None, &meta, None);
            };
            let Ok(path) = selected.into_path() else {
                return failure(
                    AppError::new(
                        AppErrorCode::InvalidArgument,
                        AppErrorCategory::Validation,
                        "selected folder is not a local filesystem path",
                    ),
                    &meta,
                );
            };
            let display_name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| "Selected folder".to_string());
            let grant_id = next_picker_grant_id();
            (grant_id, path, display_name, false)
        }
        _ => {
            return failure(
                AppError::new(
                    AppErrorCode::InvalidArgument,
                    AppErrorCategory::Validation,
                    "root source must be home or picker",
                ),
                &meta,
            );
        }
    };
    from_core(
        state
            .service
            .grants()
            .register_host_root(grant_id, path, display_name, persisted)
            .map(Some),
        &meta,
    )
}

fn next_picker_grant_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    format!("picker-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed))
}

#[tauri::command]
async fn catalog_scan(
    input: Value,
    meta: Value,
    state: State<'_, CatalogState>,
) -> Result<AppResult<skillgate_catalog::CatalogSnapshot>, ()> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return Ok(failure(error, &meta)),
    };
    let input: ScanCatalogInput = match decode_input(input, "catalog.scan") {
        Ok(input) => input,
        Err(error) => return Ok(failure(error, &meta)),
    };
    let service = state.service.clone();
    let grant_id = input.grant_id;
    let force = input.force;
    let result =
        tauri::async_runtime::spawn_blocking(move || service.scan_with_policy(&grant_id, force))
            .await;
    let result = match result {
        Ok(result) => result,
        Err(error) => {
            return Ok(failure(
                AppError::new(
                    AppErrorCode::Internal,
                    AppErrorCategory::Internal,
                    "catalog scan worker did not complete",
                )
                .with_detail("worker", error.to_string()),
                &meta,
            ));
        }
    };
    Ok(match result {
        Ok(snapshot) => {
            let revision = Some(snapshot.revision.clone());
            success(snapshot, &meta, revision)
        }
        Err(error) => failure(error, &meta),
    })
}

#[tauri::command]
fn catalog_list(
    input: Value,
    meta: Value,
    state: State<'_, CatalogState>,
) -> AppResult<skillgate_catalog::ListCatalogOutput> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: ListCatalogInput = match decode_input(input, "catalog.list") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    match state.service.list(&input) {
        Ok(output) => {
            let revision = Some(output.revision.clone());
            success(output, &meta, revision)
        }
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn catalog_search(
    input: Value,
    meta: Value,
    state: State<'_, CatalogState>,
) -> AppResult<skillgate_catalog::ListCatalogOutput> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: ListCatalogInput = match decode_input(input, "catalog.search") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    match state.service.search(&input) {
        Ok(output) => {
            let revision = Some(output.revision.clone());
            success(output, &meta, revision)
        }
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn catalog_get_item(
    input: Value,
    meta: Value,
    state: State<'_, CatalogState>,
) -> AppResult<skillgate_catalog::CatalogItem> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: GetCatalogItemInput = match decode_input(input, "catalog.getItem") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    from_core(
        state.service.get_item(&input.grant_id, &input.item_id),
        &meta,
    )
}

#[tauri::command]
fn files_read_skill_content(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<String> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: LocationInput = match decode_input(input, "files.readSkillContent") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    from_core(state.service.read_utf8(&input.location), &meta)
}

#[tauri::command]
fn files_list_supporting_files(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<Vec<SupportingFile>> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: SupportingFilesInput = match decode_input(input, "files.listSupportingFiles") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let skill_path = std::path::Path::new(&input.skill.relative_path);
    let directory = PathRef {
        grant_id: input.skill.grant_id.clone(),
        relative_path: skill_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new(""))
            .to_string_lossy()
            .into_owned(),
    };
    let main_name = skill_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned());
    let result = state.service.list_directory(&directory).map(|entries| {
        entries
            .into_iter()
            .filter(|entry| entry.kind == skillgate_files::FileKind::File)
            .filter(|entry| main_name.as_deref() != Some(entry.name.as_str()))
            .map(|entry| SupportingFile {
                relative_path: entry.name,
                size: entry.size.unwrap_or(0),
            })
            .collect()
    });
    from_core(result, &meta)
}

#[tauri::command]
fn files_read_supporting_file(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<String> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: ReadSupportingFileInput = match decode_input(input, "files.readSupportingFile") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let location = match supporting_location(&input.skill, &input.relative_path) {
        Ok(location) => location,
        Err(error) => return failure(error, &meta),
    };
    from_core(state.service.read_utf8(&location), &meta)
}

#[tauri::command]
fn files_write_skill_content(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<skillgate_files::WriteFileOutput> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: WriteFileInput = match decode_input(input, "files.writeSkillContent") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let key = match mutation_key(&meta) {
        Ok(key) => key,
        Err(error) => return failure(error, &meta),
    };
    from_core(
        state.service.write_utf8(
            &input.location,
            &input.content,
            input.expected_revision.as_deref(),
            key,
        ),
        &meta,
    )
}

#[tauri::command]
fn files_list_directory(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<Vec<skillgate_files::FileTreeEntry>> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: ListDirectoryInput = match decode_input(input, "files.listDirectory") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    from_core(state.service.list_directory(&input.directory), &meta)
}

#[tauri::command]
fn files_tree(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<skillgate_files::FileTreeEntry> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: ListDirectoryInput = match decode_input(input, "files.tree") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    from_core(
        state
            .service
            .tree(&input.directory, input.depth.unwrap_or(1).min(8)),
        &meta,
    )
}

#[tauri::command]
fn files_stat(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<skillgate_files::FileStat> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: LocationInput = match decode_input(input, "files.stat") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    from_core(state.service.stat(&input.location), &meta)
}

#[tauri::command]
fn files_delete(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<skillgate_files::DeleteFileOutput> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: DeleteFileInput = match decode_input(input, "files.delete") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if input.recovery != "quarantine" {
        return failure(
            invalid_argument("only the recoverable quarantine policy is currently supported"),
            &meta,
        );
    }
    let key = match mutation_key(&meta) {
        Ok(key) => key,
        Err(error) => return failure(error, &meta),
    };
    from_core(
        state.service.delete_to_quarantine(
            &input.location,
            input.expected_revision.as_deref(),
            key,
        ),
        &meta,
    )
}

#[tauri::command]
fn files_recover(
    input: Value,
    meta: Value,
    state: State<'_, FileState>,
) -> AppResult<skillgate_files::RecoverFileOutput> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: RecoverFileInput = match decode_input(input, "files.recover") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let key = match mutation_key(&meta) {
        Ok(key) => key,
        Err(error) => return failure(error, &meta),
    };
    from_core(state.service.recover(&input.recovery_token, key), &meta)
}

#[tauri::command]
fn files_reveal(input: Value, meta: Value, state: State<'_, FileState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: LocationInput = match decode_input(input, "files.reveal") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let authorized = match state.service.grants().authorize_existing(&input.location) {
        Ok(path) => path,
        Err(error) => return failure(error, &meta),
    };
    let path = authorized.as_path();
    #[cfg(target_os = "windows")]
    let launched = {
        let mut command = std::process::Command::new("explorer.exe");
        if path.is_file() {
            command.arg(format!("/select,{}", path.display()));
        } else {
            command.arg(path);
        }
        command.spawn()
    };
    #[cfg(target_os = "macos")]
    let launched = {
        let mut command = std::process::Command::new("open");
        if path.is_file() {
            command.arg("-R");
        }
        command.arg(path).spawn()
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let launched = std::process::Command::new("xdg-open")
        .arg(if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        })
        .spawn();
    match launched {
        Ok(_) => success(json!({ "value": null }), &meta, None),
        Err(error) => failure(
            AppError::new(
                AppErrorCode::Internal,
                AppErrorCategory::Internal,
                "operating system file manager could not be started",
            )
            .with_detail("osError", error.to_string()),
            &meta,
        ),
    }
}

#[tauri::command]
fn agent_launch_get_harness_policy(input: Value, meta: Value) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    if let Err(error) = decode_input::<Value>(input, "agentLaunch.getHarnessPolicy") {
        return failure(error, &meta);
    }
    let resolver = SystemCliResolver;
    let policies = [
        AgentHarness::Cursor,
        AgentHarness::ClaudeCode,
        AgentHarness::Codex,
    ]
    .into_iter()
    .map(|harness| {
        let policy = HarnessPolicy::for_harness(harness);
        let resolved = resolver.resolve(harness);
        json!({
            "harness": harness,
            "installed": resolved.is_ok(),
            "models": policy.models,
            "defaultModel": policy.default_model,
            "missingCliGuidance": resolved.err().map(|error| error.to_string())
        })
    })
    .collect::<Vec<_>>();
    success(json!(policies), &meta, None)
}

#[tauri::command]
fn agent_launch_prepare(
    input: Value,
    meta: Value,
    state: State<'_, RuntimeState>,
) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: PrepareAgentInput = match decode_input(input, "agentLaunch.prepare") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let request = AgentLaunchRequest {
        agent: runtime_path(&input.agent.location),
        cwd: runtime_path(&input.cwd),
        harness: input.harness,
        model: input.model,
        prompt: input.prompt,
    };
    match state.launches.prepare(request) {
        Ok(prepared) => success(
            json!({
                "preparedLaunchId": prepared.prepared_launch_id,
                "agent": input.agent,
                "harness": prepared.launch.harness,
                "model": prepared.launch.model,
                "normalizedPrompt": prepared.launch.normalized_prompt,
                "cwd": input.cwd,
                "executableIdentity": prepared.launch.executable.file_name().map(|value| value.to_string_lossy().into_owned()).unwrap_or_default(),
                "argv": prepared.launch.argv,
                "expiresAt": system_time_rfc3339(prepared.expires_at)
            }),
            &meta,
            None,
        ),
        Err(error) => failure(runtime_error(error), &meta),
    }
}

#[tauri::command]
fn terminals_create(
    input: Value,
    meta: Value,
    state: State<'_, RuntimeState>,
    app: tauri::AppHandle,
) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: CreateTerminalInput = match decode_input(input, "terminals.create") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let sink_app = app.clone();
    let sink = Arc::new(move |event: TerminalEvent| {
        sink_app
            .state::<EventState>()
            .emit_terminal(&sink_app, event);
    });
    match state.terminals.create_prepared(
        &state.launches,
        &input.prepared_launch_id,
        TerminalSize {
            columns: input.columns,
            rows: input.rows,
        },
        sink,
    ) {
        Ok(session) => success(
            json!({
                "terminalId": session.terminal_id,
                "pid": session.pid.unwrap_or(0),
                "startedAt": system_time_rfc3339(session.started_at)
            }),
            &meta,
            None,
        ),
        Err(error) => failure(runtime_error(error), &meta),
    }
}

#[tauri::command]
fn terminals_write(input: Value, meta: Value, state: State<'_, RuntimeState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: TerminalInput = match decode_input(input, "terminals.write") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    match state
        .terminals
        .write(&input.terminal_id, input.data.as_bytes())
    {
        Ok(()) => success(json!({ "value": null }), &meta, None),
        Err(error) => failure(runtime_error(error), &meta),
    }
}

#[tauri::command]
fn terminals_resize(input: Value, meta: Value, state: State<'_, RuntimeState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: ResizeTerminalInput = match decode_input(input, "terminals.resize") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    match state.terminals.resize(
        &input.terminal_id,
        TerminalSize {
            columns: input.columns,
            rows: input.rows,
        },
    ) {
        Ok(()) => success(json!({ "value": null }), &meta, None),
        Err(error) => failure(runtime_error(error), &meta),
    }
}

#[tauri::command]
fn terminals_close(input: Value, meta: Value, state: State<'_, RuntimeState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: TerminalIdInput = match decode_input(input, "terminals.close") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let key = match mutation_key(&meta) {
        Ok(key) => key,
        Err(error) => return failure(error, &meta),
    };
    match state.terminals.close(&input.terminal_id) {
        Ok(outcome) => success(
            json!({ "committed": true, "idempotencyKey": key, "replayed": matches!(outcome, skillgate_runtime::CloseOutcome::AlreadyClosed) }),
            &meta,
            None,
        ),
        Err(error) => failure(runtime_error(error), &meta),
    }
}

#[tauri::command]
fn events_subscribe(input: Value, meta: Value, state: State<'_, EventState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: SubscribeEventInput = match decode_input(input, "events.subscribe") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if !matches!(input.kind.as_str(), "terminal.output" | "terminal.exit") {
        return failure(
            invalid_argument("this host slice only supports terminal event subscriptions"),
            &meta,
        );
    }
    let subscription_id = format!("subscription-{}", next_picker_grant_id());
    match state.subscriptions.lock() {
        Ok(mut subscriptions) => {
            subscriptions.insert(
                subscription_id.clone(),
                EventSubscription {
                    kind: input.kind,
                    terminal_id: input.terminal_id,
                },
            );
            if let Ok(mut sequences) = state.sequences.lock() {
                sequences.insert(subscription_id.clone(), 0);
            }
            success(json!({ "subscriptionId": subscription_id }), &meta, None)
        }
        Err(_) => failure(
            AppError::new(
                AppErrorCode::Internal,
                AppErrorCategory::Internal,
                "event subscription store is unavailable",
            ),
            &meta,
        ),
    }
}

#[tauri::command]
fn events_unsubscribe(input: Value, meta: Value, state: State<'_, EventState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: UnsubscribeEventInput = match decode_input(input, "events.unsubscribe") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if let Ok(mut subscriptions) = state.subscriptions.lock() {
        subscriptions.remove(&input.subscription_id);
    }
    if let Ok(mut sequences) = state.sequences.lock() {
        sequences.remove(&input.subscription_id);
    }
    success(json!({ "value": null }), &meta, None)
}

#[tauri::command]
fn preferences_get(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: PreferenceGetInput = match decode_input(input, "preferences.get") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    match with_store(&state, |store| store.preferences().get(&input.key)) {
        Ok(value) => success(value.unwrap_or(input.default_value), &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn preferences_set(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: PreferenceSetInput = match decode_input(input, "preferences.set") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let key = match mutation_key(&meta) {
        Ok(key) => key,
        Err(error) => return failure(error, &meta),
    };
    match with_store(&state, |store| {
        store.preferences().set(&input.key, &input.value)
    }) {
        Ok(()) => success(
            json!({ "committed": true, "idempotencyKey": key, "replayed": false }),
            &meta,
            None,
        ),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn preferences_all(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    if let Err(error) = decode_input::<BTreeMap<String, Value>>(input, "preferences.all") {
        return failure(error, &meta);
    }
    match with_store(&state, |store| store.preferences().all()) {
        Ok(values) => success(json!(values), &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn preferences_list_favorites(
    input: Value,
    meta: Value,
    state: State<'_, StoreState>,
) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    if let Err(error) = decode_input::<BTreeMap<String, Value>>(input, "preferences.listFavorites")
    {
        return failure(error, &meta);
    }
    match with_store(&state, |store| store.favorites().list()) {
        Ok(values) => success(json!(values), &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn preferences_toggle_favorite(
    input: Value,
    meta: Value,
    state: State<'_, StoreState>,
) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: FavoriteInput = match decode_input(input, "preferences.toggleFavorite") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if let Err(error) = mutation_key(&meta) {
        return failure(error, &meta);
    }
    match with_store(&state, |store| store.favorites().toggle(&input.name)) {
        Ok(FavoriteToggle::Added) => success(json!(true), &meta, None),
        Ok(FavoriteToggle::Removed) => success(json!(false), &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn remotes_list(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    if let Err(error) = decode_input::<BTreeMap<String, Value>>(input, "remotes.list") {
        return failure(error, &meta);
    }
    match with_store(&state, |store| store.remotes().list()) {
        Ok(values) => success(
            Value::Array(values.into_iter().map(remote_to_wire).collect()),
            &meta,
            None,
        ),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn remotes_create(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: CreateRemoteInput = match decode_input(input, "remotes.create") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if let Err(error) = mutation_key(&meta) {
        return failure(error, &meta);
    }
    let server = StoredRemoteServer {
        id: format!("remote-{}", next_picker_grant_id()),
        label: input.label,
        host: input.host,
        port: input.port,
        username: input.username,
        skills_base_path: input.skills_base_path,
        ssh_key_path: input
            .ssh_key_ref
            .and_then(|value| serde_json::to_string(&value).ok()),
        last_sync_at: None,
        last_sync_error: None,
        created_at: Some(now_rfc3339()),
    };
    match with_store(&state, |store| store.remotes().create(&server)) {
        Ok(()) => success(remote_to_wire(server), &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn remotes_update(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: UpdateRemoteInput = match decode_input(input, "remotes.update") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    if let Err(error) = mutation_key(&meta) {
        return failure(error, &meta);
    }
    let result = with_store(&state, |store| {
        let Some(mut server) = store.remotes().get(&input.id)? else {
            return Ok(None);
        };
        let fields = input.fields.as_object().ok_or_else(|| {
            skillgate_store::StoreError::Json(serde_json::Error::io(std::io::Error::other(
                "remote fields must be an object",
            )))
        })?;
        if let Some(value) = fields.get("label").and_then(Value::as_str) {
            server.label = value.to_string();
        }
        if let Some(value) = fields.get("host").and_then(Value::as_str) {
            server.host = value.to_string();
        }
        if let Some(value) = fields
            .get("port")
            .and_then(Value::as_u64)
            .and_then(|value| u16::try_from(value).ok())
        {
            server.port = value;
        }
        if let Some(value) = fields.get("username").and_then(Value::as_str) {
            server.username = value.to_string();
        }
        if let Some(value) = fields.get("skillsBasePath").and_then(Value::as_str) {
            server.skills_base_path = value.to_string();
        }
        if let Some(value) = fields.get("sshKeyRef") {
            server.ssh_key_path = if value.is_null() {
                None
            } else {
                Some(serde_json::to_string(value)?)
            };
        }
        store.remotes().update(&server)?;
        Ok(Some(server))
    });
    match result {
        Ok(Some(server)) => success(remote_to_wire(server), &meta, None),
        Ok(None) => success(Value::Null, &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn remotes_delete(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    let input: RemoteIdInput = match decode_input(input, "remotes.delete") {
        Ok(input) => input,
        Err(error) => return failure(error, &meta),
    };
    let key = match mutation_key(&meta) {
        Ok(key) => key,
        Err(error) => return failure(error, &meta),
    };
    match with_store(&state, |store| store.remotes().delete(&input.id)) {
        Ok(committed) => success(
            json!({ "committed": committed, "idempotencyKey": key, "replayed": false }),
            &meta,
            None,
        ),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn remotes_count(input: Value, meta: Value, state: State<'_, StoreState>) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    if let Err(error) = decode_input::<BTreeMap<String, Value>>(input, "remotes.count") {
        return failure(error, &meta);
    }
    match with_store(&state, |store| store.remotes().list()) {
        Ok(values) => success(json!(values.len()), &meta, None),
        Err(error) => failure(error, &meta),
    }
}

#[tauri::command]
fn updates_get_state(
    input: Value,
    meta: Value,
    state: State<'_, UpdaterState>,
) -> AppResult<Value> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return failure(error, &meta),
    };
    if let Err(error) = decode_input::<Value>(input, "updates.getState") {
        return failure(error, &meta);
    }
    success(state.current(), &meta, None)
}

#[tauri::command]
async fn updates_check(
    input: Value,
    meta: Value,
    state: State<'_, UpdaterState>,
    app: tauri::AppHandle,
) -> Result<AppResult<Value>, ()> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return Ok(failure(error, &meta)),
    };
    if let Err(error) = decode_input::<Value>(input, "updates.check") {
        return Ok(failure(error, &meta));
    }
    state.replace_state(update_state("checking", None, None));
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            let message = error.to_string();
            state.replace_state(update_state("error", None, Some(&message)));
            return Ok(failure(
                AppError::new(
                    AppErrorCode::CapabilityUnavailable,
                    AppErrorCategory::Unavailable,
                    "signed updater is not configured for this build",
                )
                .with_detail("updater", message),
                &meta,
            ));
        }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            if let Ok(mut pending) = state.pending.lock() {
                *pending = Some(update);
            }
            let next = update_state("available", Some(&version), None);
            state.replace_state(next.clone());
            Ok(success(next, &meta, None))
        }
        Ok(None) => {
            let next = update_state("not-available", None, None);
            state.replace_state(next.clone());
            Ok(success(next, &meta, None))
        }
        Err(error) => {
            let message = error.to_string();
            state.replace_state(update_state("error", None, Some(&message)));
            Ok(failure(
                AppError::new(
                    AppErrorCode::CapabilityUnavailable,
                    AppErrorCategory::Unavailable,
                    "update check failed",
                )
                .with_detail("updater", message),
                &meta,
            ))
        }
    }
}

#[tauri::command]
async fn updates_install(
    input: Value,
    meta: Value,
    state: State<'_, UpdaterState>,
    app: tauri::AppHandle,
) -> Result<AppResult<Value>, ()> {
    let meta = match decode_meta(meta) {
        Ok(meta) => meta,
        Err((meta, error)) => return Ok(failure(error, &meta)),
    };
    if let Err(error) = decode_input::<Value>(input, "updates.install") {
        return Ok(failure(error, &meta));
    }
    let key = match mutation_key(&meta) {
        Ok(key) => key.to_string(),
        Err(error) => return Ok(failure(error, &meta)),
    };
    let update = state
        .pending
        .lock()
        .ok()
        .and_then(|mut pending| pending.take());
    let Some(update) = update else {
        return Ok(failure(
            AppError::new(
                AppErrorCode::InvalidState,
                AppErrorCategory::Conflict,
                "no verified update is pending installation",
            ),
            &meta,
        ));
    };
    state.replace_state(update_state("downloading", Some(&update.version), None));
    let progress_state = Arc::clone(&state.state);
    let finished_state = Arc::clone(&state.state);
    let available_version = update.version.clone();
    let progress_version = available_version.clone();
    let install = update
        .download_and_install(
            move |_chunk, _total| {
                if let Ok(mut state) = progress_state.lock() {
                    *state = update_state("downloading", Some(&progress_version), None);
                }
            },
            move || {
                if let Ok(mut state) = finished_state.lock() {
                    *state = update_state("downloaded", Some(&available_version), None);
                }
            },
        )
        .await;
    if let Err(error) = install {
        let message = error.to_string();
        state.replace_state(update_state("error", None, Some(&message)));
        return Ok(failure(
            AppError::new(
                AppErrorCode::Internal,
                AppErrorCategory::Internal,
                "verified update could not be installed",
            )
            .with_detail("updater", message),
            &meta,
        ));
    }
    let receipt = json!({ "committed": true, "idempotencyKey": key, "replayed": false });
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        app.restart();
    });
    Ok(success(receipt, &meta, None))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let grants = GrantRegistry::new();
            let quarantine = app.path().app_local_data_dir()?.join("quarantine");
            let files = FileService::new(grants.clone(), quarantine)
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let launches = PreparedLaunchStore::new(
                Arc::new(CatalogGrantAdapter {
                    grants: grants.clone(),
                }),
                Arc::new(SystemCliResolver),
                Duration::from_secs(60),
            );
            app.manage(CatalogState::new(grants));
            app.manage(FileState { service: files });
            app.manage(RuntimeState {
                launches,
                terminals: TerminalManager::default(),
            });
            app.manage(EventState::default());
            app.manage(UpdaterState::new());
            let store = Store::open(StorePaths::from_environment()?, env!("CARGO_PKG_VERSION"))
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            app.manage(StoreState {
                store: Mutex::new(store),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_describe,
            catalog_select_root,
            catalog_scan,
            catalog_list,
            catalog_search,
            catalog_get_item,
            files_read_skill_content,
            files_list_supporting_files,
            files_read_supporting_file,
            files_write_skill_content,
            files_list_directory,
            files_tree,
            files_stat,
            files_delete,
            files_recover,
            files_reveal,
            agent_launch_get_harness_policy,
            agent_launch_prepare,
            terminals_create,
            terminals_write,
            terminals_resize,
            terminals_close,
            events_subscribe,
            events_unsubscribe,
            preferences_get,
            preferences_set,
            preferences_all,
            preferences_list_favorites,
            preferences_toggle_favorite,
            remotes_list,
            remotes_create,
            remotes_update,
            remotes_delete,
            remotes_count,
            updates_get_state,
            updates_check,
            updates_install
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Skillgate desktop host")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_meta() -> RequestMeta {
        RequestMeta {
            request_id: "request-1".to_string(),
            correlation_id: "correlation-1".to_string(),
            idempotency_key: None,
            deadline_ms: None,
        }
    }

    #[test]
    fn app_description_advertises_read_only_catalog() {
        let value = serde_json::to_value(app_describe(
            json!({ "requestedMajor": 1 }),
            serde_json::to_value(request_meta()).unwrap(),
        ))
        .unwrap();
        assert_eq!(value["ok"], true);
        assert_eq!(value["data"]["implementation"]["name"], "Skillgate");
        assert_eq!(value["data"]["contract"]["major"], 1);
        assert_eq!(
            value["data"]["capabilities"]["catalog.local"]["state"],
            "degraded"
        );
        assert_eq!(value["meta"]["requestId"], "request-1");
        assert_eq!(value["meta"]["correlationId"], "correlation-1");
    }

    #[test]
    fn core_errors_keep_the_request_envelope() {
        let value = serde_json::to_value(failure::<Value>(
            AppError::new(
                AppErrorCode::PathNotGranted,
                AppErrorCategory::Authorization,
                "unknown grant",
            ),
            &request_meta(),
        ))
        .unwrap();
        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "PATH_NOT_GRANTED");
        assert_eq!(value["meta"]["requestId"], "request-1");
    }

    #[test]
    fn malformed_input_is_a_validation_envelope() {
        let meta = request_meta();
        let error =
            decode_input::<ScanCatalogInput>(json!({ "grantId": 7 }), "catalog.scan").unwrap_err();
        let value = serde_json::to_value(failure::<Value>(error, &meta)).unwrap();
        assert_eq!(value["ok"], false);
        assert_eq!(value["error"]["code"], "INVALID_ARGUMENT");
        assert_eq!(value["meta"]["requestId"], "request-1");
    }
}
