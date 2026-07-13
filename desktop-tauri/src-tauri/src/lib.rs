use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use skillgate_catalog::{
    AppError, AppErrorCategory, AppErrorCode, CatalogService, GrantRegistry, ListCatalogInput,
};
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RequestMeta {
    request_id: String,
    correlation_id: String,
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
            completed_at: OffsetDateTime::now_utc()
                .format(&Rfc3339)
                .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string()),
            revision,
        }
    }
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

impl Default for CatalogState {
    fn default() -> Self {
        Self {
            service: CatalogService::new(GrantRegistry::new()),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(CatalogState::default())
        .invoke_handler(tauri::generate_handler![
            app_describe,
            catalog_select_root,
            catalog_scan,
            catalog_list,
            catalog_search,
            catalog_get_item
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
