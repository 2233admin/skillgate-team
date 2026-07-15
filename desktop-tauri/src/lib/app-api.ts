export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export type RequestId = string
export type CorrelationId = string
export type EmptyInput = Record<string, never>
export interface EmptyOutput { value: null }

export type CapabilityId =
  | "app.identity" | "agents.discovery" | "agents.launch" | "catalog.local"
  | "catalog.remote" | "files.workspace" | "skills.manage" | "remotes.ssh"
  | "preferences.local" | "updates.signed" | "team.workflows" | "terminals.pty"
export type CapabilityState = "available" | "unavailable" | "degraded"
export interface CapabilityDescriptor { state: CapabilityState; version: string; operations: string[]; reason?: AppError }
export interface AppDescription {
  contract: { major: 1; minor: number }
  implementation: { name: string; version: string; platform: string; arch: string }
  capabilities: Record<CapabilityId, CapabilityDescriptor>
}
export interface DescribeInput { requestedMajor?: number }
export interface CancelInput { requestId: RequestId }
export interface CancelReceipt { requestId: RequestId; status: "requested" | "already_finished" | "unknown" }
export interface MutationReceipt { committed: boolean; idempotencyKey: string; replayed: boolean }
export interface RequestMeta {
  requestId: RequestId
  correlationId: CorrelationId
  idempotencyKey?: string
  deadlineMs?: number
}
export interface ResponseMeta {
  requestId: RequestId
  correlationId: CorrelationId
  completedAt: string
  revision?: string
  mutation?: MutationReceipt
}
export type AppErrorCode =
  | "INVALID_ARGUMENT" | "INVALID_STATE" | "UNSUPPORTED_VERSION"
  | "CAPABILITY_UNAVAILABLE" | "TRANSPORT_UNAVAILABLE" | "SIDECAR_UNAVAILABLE"
  | "PATH_NOT_GRANTED" | "PATH_ESCAPE" | "SYMLINK_ESCAPE" | "PERMISSION_DENIED"
  | "NOT_FOUND" | "ALREADY_EXISTS" | "REVISION_CONFLICT" | "WRITER_BUSY"
  | "CANCELLED" | "DEADLINE_EXCEEDED" | "NETWORK_UNAVAILABLE"
  | "REMOTE_AUTH_FAILED" | "REMOTE_OPERATION_FAILED" | "PROCESS_START_FAILED"
  | "PROCESS_EXITED" | "UPDATE_VERIFICATION_FAILED" | "TEAM_ROOT_MISSING"
  | "PROFILE_NOT_FOUND" | "NO_AGENTS" | "APPLY_PARTIAL_FAIL" | "LOCK_MISMATCH"
  | "NETWORK_TIMEOUT" | "INTERNAL"
export type AppErrorCategory = "validation" | "authorization" | "conflict" | "not_found" | "cancelled" | "timeout" | "unavailable" | "external" | "internal"
export interface AppError { code: AppErrorCode; message: string; category: AppErrorCategory; retryable: boolean; details?: Record<string, unknown> }
export type AppResult<T> = { ok: true; data: T; meta: ResponseMeta } | { ok: false; error: AppError; meta: ResponseMeta }

export interface PathRef { grantId: string; relativePath: string }
export interface RootGrant { grantId: string; displayName: string; persisted: boolean }
export interface SupportingFile { relativePath: string; size: number }
export type SkillScope = "global" | "project" | "custom"
export interface DetectedAgent { name: string; displayName: string; shortCode: string }
export interface InstalledSkill {
  itemId: string; name: string; description: string; location: PathRef; canonicalItemId: string
  agents: string[]; agentShortCodes: string[]; scope: SkillScope; projectName: string | null
  hasSupportingFiles: boolean; supportingFiles: SupportingFile[]; source?: string; sourceType?: string
  installedAt?: string; updatedAt?: string
}

export type CatalogKind = "skill" | "agent" | "rule" | "context"
export type CatalogPlatform = "cursor" | "claude" | "codex" | "shared"
export type CatalogScope = "global" | "project"
export type CatalogInstallationLevel = "global" | "project" | "plugin" | "external"
export type CatalogSourceKind = "local" | "plugin" | "manifest" | "external"
export type CatalogUsageStatus = "untracked" | "active" | "stale"
export type CatalogRiskLevel = "low" | "medium" | "high"
export type CatalogRiskSignal = "destructiveCommand" | "remoteExecution" | "elevatedPrivileges" | "credentialAccess"
export interface CatalogSkillMetadata {
  compatibleWith: CatalogPlatform[]
  installationLevel: CatalogInstallationLevel
  sourceKind: CatalogSourceKind
  sourceLabel: string
  usageStatus: CatalogUsageStatus
  usageCount: number | null
  lastUsedAt: string | null
  installationCount: number
  riskLevel: CatalogRiskLevel
  riskSignals: CatalogRiskSignal[]
}
export interface CatalogSkill { id: string; skillId: string; name: string; installs: number; source: string; isOfficial?: boolean }
export interface CatalogAlias { location: PathRef; displayPath: string }
export interface CatalogItem {
  itemId: string; canonicalItemId: string; kind: CatalogKind; platform: CatalogPlatform; scope: CatalogScope
  projectName: string | null; groupId: string; groupLabel: string; pluginName?: string; name: string
  slug: string; description: string; creator?: string; location: PathRef; displayPath: string
  aliases: CatalogAlias[]; createdAt: string | null; modifiedAt: string; skillMeta?: CatalogSkillMetadata
}
export interface CatalogGroup { groupId: string; label: string; kind: CatalogKind; platform: CatalogPlatform; itemIds: string[] }
export interface CatalogSummary {
  total: number; byKind: Record<CatalogKind, number>; byPlatform: Record<CatalogPlatform, number>
  byScope: Record<CatalogScope, number>; byInstallationLevel: Record<CatalogInstallationLevel, number>
  byRiskLevel: Record<CatalogRiskLevel, number>; projectNames: string[]
}
export interface CatalogSnapshot { grant: RootGrant; revision: string; groups: CatalogGroup[]; items: CatalogItem[]; summary: CatalogSummary; skippedUnreadable: number }
export interface CatalogFilter {
  query?: string; kinds?: CatalogKind[]; platforms?: CatalogPlatform[]; scopes?: CatalogScope[]
  installationLevels?: CatalogInstallationLevel[]; riskLevels?: CatalogRiskLevel[]
  projectNames?: string[]; groupIds?: string[]
}
export interface SelectCatalogRootInput { source: "home" | "picker"; previousGrantId?: string }
export interface ScanCatalogInput { grantId: string; force?: boolean }
export interface ListCatalogInput { grantId: string; filter?: CatalogFilter; offset?: number; limit?: number }
export interface ListCatalogOutput { revision: string; groups: CatalogGroup[]; items: CatalogItem[]; summary: CatalogSummary; totalMatched: number }
export interface GetCatalogItemInput { grantId: string; itemId: string }
export interface WatchCatalogInput { grantId: string; afterRevision?: string }
export interface ListInstalledInput { grantId?: string }
export interface RescanCatalogInput { grantId?: string; force?: boolean }
export interface SearchCatalogInput { query: string; limit?: number; offset?: number }
export interface SearchCatalogOutput { skills: CatalogSkill[]; count: number }
export interface FetchSkillContentInput { source: string; skillId: string }

export interface ReadSkillContentInput { location: PathRef }
export interface ListSupportingFilesInput { skill: PathRef }
export interface ReadSupportingFileInput { skill: PathRef; relativePath: string }
export interface WriteSkillContentInput { location: PathRef; content: string; expectedRevision?: string }
export interface WriteSkillContentOutput { revision: string; receipt: MutationReceipt }
export interface RevealFileInput { location: PathRef }
export interface ListDirectoryInput { directory: PathRef; depth?: number }
export interface FileTreeEntry { entryId: string; name: string; location: PathRef; kind: "file" | "directory" | "symlink"; size: number | null; modifiedAt: string; children?: FileTreeEntry[] }
export interface StatFileInput { location: PathRef }
export interface FileStat { location: PathRef; kind: "file" | "directory" | "symlink"; size: number; createdAt: string | null; modifiedAt: string; revision: string }
export interface DeleteFileInput { location: PathRef; expectedRevision?: string; recovery: "trash" | "quarantine" }
export interface DeleteFileOutput { recoveryToken: string; recoverableUntil?: string; receipt: MutationReceipt }
export interface RecoverFileInput { recoveryToken: string }

export type SkillSource = { kind: "catalog"; sourceId: string; skillId: string } | { kind: "url"; url: string } | { kind: "local"; location: PathRef }
export interface InstallSkillInput { source: SkillSource; targetAgentIds: string[]; scope: SkillScope }
export interface InstallResult { skillName: string; agent: string; success: boolean; location: PathRef; error?: string }
export interface InstallSkillViaCliInput { source: SkillSource }
export interface InstallSkillViaCliOutput { success: boolean; output: string; error?: string }
export interface CreateSkillInput { name: string; description?: string; content?: string; agentNames?: string[] }
export interface CreateSkillOutput { name: string; location: PathRef; targets: string[]; receipt: MutationReceipt }
export interface SkillNameInput { name: string }
export interface RemoveFromAgentInput { skillName: string; agentName: string }
export interface AddToAgentInput { skillName: string; canonicalItemId: string; targetAgentId: string }

export interface RemoteServer { id: string; label: string; host: string; port: number; username: string; skillsBasePath: string; sshKeyRef: PathRef | null; lastSyncAt: string | null; lastSyncError: string | null; createdAt: string; skillCount?: number }
export interface RemoteSkill { id: string; serverId: string; name: string; description: string | null; remotePath: string; content: string | null; contentHash: string | null; syncedAt: string }
export interface CreateServerInput { label: string; host: string; port?: number; username: string; skillsBasePath?: string; sshKeyRef?: PathRef | null }
export interface UpdateServerInput { id: string; fields: Partial<CreateServerInput> }
export interface ServerIdInput { id: string }
export interface ServerPathInput { serverId: string; remotePath: string }
export interface WriteRemoteSkillInput extends ServerPathInput { content: string }
export interface SyncResult { added: number; updated: number; removed: number; unchanged: number; error?: string }
export type PushReason = "added" | "updated" | "deleted" | "unchanged"
export interface PushPlanEntry { folderName: string; name: string; localItemId: string; localLocation: PathRef; remotePath: string; remoteDir: string; reason: PushReason; localHash?: string; remoteHash?: string }
export interface PushPreviewInput { serverId: string; mirror: boolean }
export interface PushPreview { toAdd: PushPlanEntry[]; toUpdate: PushPlanEntry[]; toDelete: PushPlanEntry[]; unchanged: PushPlanEntry[]; mirror: boolean }
export interface PushApplyInput { serverId: string; preview: PushPreview }
export interface PushApplyOutput { added: number; updated: number; deleted: number; unchanged: number; errors: Array<{ folderName: string; message: string }>; receipt: MutationReceipt }

export interface SettingGetInput<T extends JsonValue> { key: string; defaultValue: T }
export interface SettingSetInput { key: string; value: JsonValue }
export interface FavoriteNameInput { name: string }
export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available" | "error"
export interface UpdateState { status: UpdateStatus; version: string; availableVersion?: string; downloadedVersion?: string; progressPercent?: number; message?: string }

export type TeamProfileSource = "explicit" | "linked_project" | "settings" | "cwd" | "default"
export interface TeamContextInput { teamRootGrantId?: string; linkedProjectGrantId?: string; profile?: string }
export interface TeamContext { teamRoot: PathRef; linkedProject?: PathRef; effectiveProfile: string; profileSource: TeamProfileSource }
export interface TeamProfileSummary { name: string; description?: string; skillCount: number; agents?: string[] }
export interface TeamProfileSummaryInput extends TeamContextInput { profile: string }
export interface TeamDriftItem { skill: string; kind: string; expected?: string; actual?: string; location?: PathRef; agent?: string }
export interface TeamDoctorResult { ok: boolean; profile: string; drifts: TeamDriftItem[]; agentCount: number; teamRoot: PathRef }
export interface TeamDoctorInput extends TeamContextInput {}
export interface TeamLockMismatch { skill: string; lockHash: string | null; diskHash: string }
export interface TeamLockVerifyResult { ok: boolean; mismatches: TeamLockMismatch[]; mismatchCount: number; updated: boolean }
export interface TeamLockVerifyInput extends TeamContextInput { write?: boolean }
export interface TeamApplySkillResult { skill: string; agent: string; success: boolean; error?: string }
export interface TeamApplyResult { profile: string; installed: number; failed: number; skipped: string[]; method: string; agents: string[]; results: TeamApplySkillResult[]; lockUpdated: boolean }
export interface TeamApplyInput extends TeamContextInput { upgrade?: boolean; writeLock?: boolean; dryRun?: boolean }
export interface TeamCatalogDriftResult { status: "ok" | "behind" | "unknown"; fromCache: boolean; localVersion?: string; remoteVersion?: string; message?: string }
export interface TeamCatalogDriftInput extends TeamContextInput { force?: boolean }
export interface TeamDriftState extends TeamCatalogDriftResult { error?: string }
export interface TeamLastApplyState { appliedAt: string; profile: string; revision: number; teamRoot: PathRef; method: string; agents: string[] }
export interface TeamSetLastProfileInput { profile: string }

export type AgentHarness = "cursor" | "claude-code" | "codex"
export type HarnessModel = "auto" | "composer-2.5" | "opus-4.8" | "fable-5" | "sonnet-5" | "gpt-5-5" | "sonnet-4.6" | "haiku-4.5" | "o3" | "gpt-5-codex" | "codex-mini"
export interface AgentCatalogSelection { itemId: string; canonicalItemId: string; name: string; slug: string; platform: CatalogPlatform; location: PathRef }
export interface HarnessPolicy { harness: AgentHarness; installed: boolean; models: HarnessModel[]; defaultModel: HarnessModel; missingCliGuidance?: string }
export interface GetHarnessPolicyInput { agentItemId: string }
export interface PrepareAgentLaunchInput { agent: AgentCatalogSelection; harness: AgentHarness; model: HarnessModel; prompt?: string; cwd: PathRef }
export interface PreparedAgentLaunch { preparedLaunchId: string; agent: AgentCatalogSelection; harness: AgentHarness; model: HarnessModel; normalizedPrompt: string | null; cwd: PathRef; executableIdentity: string; argv: string[]; expiresAt: string }

export interface CreateTerminalInput { preparedLaunchId: string; columns: number; rows: number }
export interface TerminalSession { terminalId: string; pid: number; startedAt: string }
export interface TerminalInput { terminalId: string; data: string }
export interface ResizeTerminalInput { terminalId: string; columns: number; rows: number }
export interface TerminalIdInput { terminalId: string }

export type EventKind = "catalog.scan-start" | "catalog.changed" | "catalog.scan-complete" | "catalog.scan-error" | "skills.updated" | "updates.state" | "team.drift-state" | "terminal.output" | "terminal.exit"
export interface EventPayloadMap {
  "catalog.scan-start": { grantId: string; previousRevision?: string }
  "catalog.changed": { grantId: string; revision: string; reason: "scan" | "filesystem" | "mutation"; summary: CatalogSummary; changedItemIds: string[]; removedItemIds: string[] }
  "catalog.scan-complete": { snapshot: CatalogSnapshot }
  "catalog.scan-error": { grantId: string; error: AppError }
  "skills.updated": { skills: InstalledSkill[]; snapshotRevision: string }
  "updates.state": { state: UpdateState }
  "team.drift-state": { state: TeamDriftState }
  "terminal.output": { terminalId: string; data: string }
  "terminal.exit": { terminalId: string; exitCode: number | null; signal?: string }
}
export interface SubscribeInput<K extends EventKind> { kind: K; terminalId?: string; afterRevision?: string }
export interface Subscription<K extends EventKind> { subscriptionId: string; snapshotRevision?: string; initial?: EventPayloadMap[K] }
export interface UnsubscribeInput { subscriptionId: string }
export interface AppEvent<T> { kind: EventKind; stream: string; subscriptionId: string; sequence: number; emittedAt: string; correlationId?: string; revision?: string; payload: T }
export type EventListener<K extends EventKind> = (event: AppEvent<EventPayloadMap[K]>) => void

export interface ApplicationAPI { getVersion(input: EmptyInput, meta: RequestMeta): Promise<AppResult<string>> }
export interface AgentsAPI { detect(input: EmptyInput, meta: RequestMeta): Promise<AppResult<DetectedAgent[]>> }
export interface AgentLaunchAPI {
  getHarnessPolicy(input: GetHarnessPolicyInput, meta: RequestMeta): Promise<AppResult<HarnessPolicy[]>>
  prepare(input: PrepareAgentLaunchInput, meta: RequestMeta): Promise<AppResult<PreparedAgentLaunch>>
}
export interface CatalogAPI {
  selectRoot(input: SelectCatalogRootInput, meta: RequestMeta): Promise<AppResult<RootGrant | null>>
  scan(input: ScanCatalogInput, meta: RequestMeta): Promise<AppResult<CatalogSnapshot>>
  list(input: ListCatalogInput, meta: RequestMeta): Promise<AppResult<ListCatalogOutput>>
  search(input: ListCatalogInput, meta: RequestMeta): Promise<AppResult<ListCatalogOutput>>
  getItem(input: GetCatalogItemInput, meta: RequestMeta): Promise<AppResult<CatalogItem>>
  watch(input: WatchCatalogInput, meta: RequestMeta): Promise<AppResult<Subscription<"catalog.changed">>>
  listInstalled(input: ListInstalledInput, meta: RequestMeta): Promise<AppResult<InstalledSkill[]>>
  rescan(input: RescanCatalogInput, meta: RequestMeta): Promise<AppResult<InstalledSkill[]>>
  searchRemote(input: SearchCatalogInput, meta: RequestMeta): Promise<AppResult<SearchCatalogOutput>>
  fetchTrending(input: EmptyInput, meta: RequestMeta): Promise<AppResult<CatalogSkill[]>>
  fetchSkillContent(input: FetchSkillContentInput, meta: RequestMeta): Promise<AppResult<string | null>>
}
export interface FilesAPI {
  readSkillContent(input: ReadSkillContentInput, meta: RequestMeta): Promise<AppResult<string>>
  listSupportingFiles(input: ListSupportingFilesInput, meta: RequestMeta): Promise<AppResult<SupportingFile[]>>
  readSupportingFile(input: ReadSupportingFileInput, meta: RequestMeta): Promise<AppResult<string>>
  writeSkillContent(input: WriteSkillContentInput, meta: RequestMeta): Promise<AppResult<WriteSkillContentOutput>>
  listDirectory(input: ListDirectoryInput, meta: RequestMeta): Promise<AppResult<FileTreeEntry[]>>
  tree(input: ListDirectoryInput, meta: RequestMeta): Promise<AppResult<FileTreeEntry>>
  stat(input: StatFileInput, meta: RequestMeta): Promise<AppResult<FileStat>>
  delete(input: DeleteFileInput, meta: RequestMeta): Promise<AppResult<DeleteFileOutput>>
  recover(input: RecoverFileInput, meta: RequestMeta): Promise<AppResult<{ location: PathRef; receipt: MutationReceipt }>>
  reveal(input: RevealFileInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
}
export interface SkillsAPI {
  install(input: InstallSkillInput, meta: RequestMeta): Promise<AppResult<InstallResult[]>>
  installViaCli(input: InstallSkillViaCliInput, meta: RequestMeta): Promise<AppResult<InstallSkillViaCliOutput>>
  create(input: CreateSkillInput, meta: RequestMeta): Promise<AppResult<CreateSkillOutput>>
  remove(input: SkillNameInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  update(input: SkillNameInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  removeFromAgent(input: RemoveFromAgentInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  addToAgent(input: AddToAgentInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
}
export interface RemotesAPI {
  list(input: EmptyInput, meta: RequestMeta): Promise<AppResult<RemoteServer[]>>
  create(input: CreateServerInput, meta: RequestMeta): Promise<AppResult<RemoteServer>>
  update(input: UpdateServerInput, meta: RequestMeta): Promise<AppResult<RemoteServer | null>>
  delete(input: ServerIdInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  test(input: ServerIdInput, meta: RequestMeta): Promise<AppResult<{ ok: boolean; error?: string }>>
  sync(input: ServerIdInput, meta: RequestMeta): Promise<AppResult<SyncResult>>
  listSkills(input: { serverId: string }, meta: RequestMeta): Promise<AppResult<RemoteSkill[]>>
  readSkill(input: ServerPathInput, meta: RequestMeta): Promise<AppResult<string>>
  writeSkill(input: WriteRemoteSkillInput, meta: RequestMeta): Promise<AppResult<{ receipt: MutationReceipt }>>
  count(input: EmptyInput, meta: RequestMeta): Promise<AppResult<number>>
  previewPush(input: PushPreviewInput, meta: RequestMeta): Promise<AppResult<PushPreview>>
  applyPush(input: PushApplyInput, meta: RequestMeta): Promise<AppResult<PushApplyOutput>>
}
export interface PreferencesAPI {
  get<T extends JsonValue>(input: SettingGetInput<T>, meta: RequestMeta): Promise<AppResult<T>>
  set(input: SettingSetInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  all(input: EmptyInput, meta: RequestMeta): Promise<AppResult<Record<string, JsonValue>>>
  listFavorites(input: EmptyInput, meta: RequestMeta): Promise<AppResult<string[]>>
  toggleFavorite(input: FavoriteNameInput, meta: RequestMeta): Promise<AppResult<boolean>>
}
export interface UpdatesAPI {
  getState(input: EmptyInput, meta: RequestMeta): Promise<AppResult<UpdateState>>
  check(input: EmptyInput, meta: RequestMeta): Promise<AppResult<UpdateState>>
  install(input: EmptyInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
}
export interface TeamAPI {
  getContext(input: TeamContextInput, meta: RequestMeta): Promise<AppResult<TeamContext>>
  listProfiles(input: TeamContextInput, meta: RequestMeta): Promise<AppResult<string[]>>
  getProfileSummary(input: TeamProfileSummaryInput, meta: RequestMeta): Promise<AppResult<TeamProfileSummary>>
  apply(input: TeamApplyInput, meta: RequestMeta): Promise<AppResult<TeamApplyResult>>
  doctor(input: TeamDoctorInput, meta: RequestMeta): Promise<AppResult<TeamDoctorResult>>
  lockVerify(input: TeamLockVerifyInput, meta: RequestMeta): Promise<AppResult<TeamLockVerifyResult>>
  catalogDrift(input: TeamCatalogDriftInput, meta: RequestMeta): Promise<AppResult<TeamCatalogDriftResult>>
  getDriftState(input: EmptyInput, meta: RequestMeta): Promise<AppResult<TeamDriftState | null>>
  getLastApplyState(input: EmptyInput, meta: RequestMeta): Promise<AppResult<TeamLastApplyState | null>>
  setLastProfile(input: TeamSetLastProfileInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
}
export interface TerminalsAPI {
  create(input: CreateTerminalInput, meta: RequestMeta): Promise<AppResult<TerminalSession>>
  write(input: TerminalInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
  resize(input: ResizeTerminalInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
  close(input: TerminalIdInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
}
export interface EventsAPI {
  subscribe<K extends EventKind>(input: SubscribeInput<K>, listener: EventListener<K>, meta: RequestMeta): Promise<AppResult<Subscription<K>>>
  unsubscribe(input: UnsubscribeInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
}
export interface AppAPI {
  describe(input?: DescribeInput): Promise<AppResult<AppDescription>>
  cancel(input: CancelInput, meta: RequestMeta): Promise<AppResult<CancelReceipt>>
  application: ApplicationAPI
  agents: AgentsAPI
  agentLaunch: AgentLaunchAPI
  catalog: CatalogAPI
  files: FilesAPI
  skills: SkillsAPI
  remotes: RemotesAPI
  preferences: PreferencesAPI
  updates: UpdatesAPI
  team: TeamAPI
  terminals: TerminalsAPI
  events: EventsAPI
}

export interface AppTransport {
  invoke<T>(command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>>
  bindEvent?<K extends EventKind>(subscriptionId: string, listener: EventListener<K>): void
}

export const APP_COMMANDS = {
  describe: "app_describe", cancel: "app_cancel", applicationGetVersion: "application_get_version",
  agentsDetect: "agents_detect", agentLaunchGetHarnessPolicy: "agent_launch_get_harness_policy", agentLaunchPrepare: "agent_launch_prepare",
  catalogSelectRoot: "catalog_select_root", catalogScan: "catalog_scan", catalogList: "catalog_list", catalogSearch: "catalog_search",
  catalogGetItem: "catalog_get_item", catalogWatch: "catalog_watch", catalogListInstalled: "catalog_list_installed", catalogRescan: "catalog_rescan",
  catalogSearchRemote: "catalog_search_remote", catalogFetchTrending: "catalog_fetch_trending", catalogFetchSkillContent: "catalog_fetch_skill_content",
  filesReadSkillContent: "files_read_skill_content", filesListSupportingFiles: "files_list_supporting_files", filesReadSupportingFile: "files_read_supporting_file",
  filesWriteSkillContent: "files_write_skill_content", filesListDirectory: "files_list_directory", filesTree: "files_tree", filesStat: "files_stat",
  filesDelete: "files_delete", filesRecover: "files_recover", filesReveal: "files_reveal",
  skillsInstall: "skills_install", skillsInstallViaCli: "skills_install_via_cli", skillsCreate: "skills_create", skillsRemove: "skills_remove",
  skillsUpdate: "skills_update", skillsRemoveFromAgent: "skills_remove_from_agent", skillsAddToAgent: "skills_add_to_agent",
  remotesList: "remotes_list", remotesCreate: "remotes_create", remotesUpdate: "remotes_update", remotesDelete: "remotes_delete",
  remotesTest: "remotes_test", remotesSync: "remotes_sync", remotesListSkills: "remotes_list_skills", remotesReadSkill: "remotes_read_skill",
  remotesWriteSkill: "remotes_write_skill", remotesCount: "remotes_count", remotesPreviewPush: "remotes_preview_push", remotesApplyPush: "remotes_apply_push",
  preferencesGet: "preferences_get", preferencesSet: "preferences_set", preferencesAll: "preferences_all",
  preferencesListFavorites: "preferences_list_favorites", preferencesToggleFavorite: "preferences_toggle_favorite",
  updatesGetState: "updates_get_state", updatesCheck: "updates_check", updatesInstall: "updates_install",
  teamGetContext: "team_get_context", teamListProfiles: "team_list_profiles", teamGetProfileSummary: "team_get_profile_summary",
  teamApply: "team_apply", teamDoctor: "team_doctor", teamLockVerify: "team_lock_verify", teamCatalogDrift: "team_catalog_drift",
  teamGetDriftState: "team_get_drift_state", teamGetLastApplyState: "team_get_last_apply_state", teamSetLastProfile: "team_set_last_profile",
  terminalsCreate: "terminals_create", terminalsWrite: "terminals_write", terminalsResize: "terminals_resize", terminalsClose: "terminals_close",
  eventsSubscribe: "events_subscribe", eventsUnsubscribe: "events_unsubscribe",
} as const

function newId(): string { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` }
export function createRequestMeta(correlationId = newId(), options: Pick<RequestMeta, "idempotencyKey" | "deadlineMs"> = {}): RequestMeta {
  return { requestId: newId(), correlationId, ...options }
}
function unsupportedVersion(description: AppDescription, meta: ResponseMeta): AppResult<AppDescription> {
  return { ok: false, error: { code: "UNSUPPORTED_VERSION", message: `AppAPI contract major ${description.contract.major} is incompatible with renderer major 1`, category: "validation", retryable: false, details: { expectedMajor: 1, actualMajor: description.contract.major } }, meta }
}

export function createAppAPI(transport: AppTransport): AppAPI {
  const call = <T>(command: string, input: unknown, meta: RequestMeta) => transport.invoke<T>(command, { input, meta })
  const catalog = {
    selectRoot: (input: SelectCatalogRootInput, meta: RequestMeta) => call<RootGrant | null>(APP_COMMANDS.catalogSelectRoot, input, meta),
    scan: (input: ScanCatalogInput, meta: RequestMeta) => call<CatalogSnapshot>(APP_COMMANDS.catalogScan, input, meta),
    list: (input: ListCatalogInput, meta: RequestMeta) => call<ListCatalogOutput>(APP_COMMANDS.catalogList, input, meta),
    search: (input: ListCatalogInput, meta: RequestMeta) => call<ListCatalogOutput>(APP_COMMANDS.catalogSearch, input, meta),
    getItem: (input: GetCatalogItemInput, meta: RequestMeta) => call<CatalogItem>(APP_COMMANDS.catalogGetItem, input, meta),
    watch: (input: WatchCatalogInput, meta: RequestMeta) => call<Subscription<"catalog.changed">>(APP_COMMANDS.catalogWatch, input, meta),
    listInstalled: (input: ListInstalledInput, meta: RequestMeta) => call<InstalledSkill[]>(APP_COMMANDS.catalogListInstalled, input, meta),
    rescan: (input: RescanCatalogInput, meta: RequestMeta) => call<InstalledSkill[]>(APP_COMMANDS.catalogRescan, input, meta),
    searchRemote: (input: SearchCatalogInput, meta: RequestMeta) => call<SearchCatalogOutput>(APP_COMMANDS.catalogSearchRemote, input, meta),
    fetchTrending: (input: EmptyInput, meta: RequestMeta) => call<CatalogSkill[]>(APP_COMMANDS.catalogFetchTrending, input, meta),
    fetchSkillContent: (input: FetchSkillContentInput, meta: RequestMeta) => call<string | null>(APP_COMMANDS.catalogFetchSkillContent, input, meta),
  } as unknown as CatalogAPI
  return {
    async describe(input = {}) {
      const result = await call<AppDescription>(APP_COMMANDS.describe, input, createRequestMeta())
      return result.ok && result.data.contract.major !== 1 ? unsupportedVersion(result.data, result.meta) : result
    },
    cancel: (input, meta) => call(APP_COMMANDS.cancel, input, meta),
    application: { getVersion: (input, meta) => call(APP_COMMANDS.applicationGetVersion, input, meta) },
    agents: { detect: (input, meta) => call(APP_COMMANDS.agentsDetect, input, meta) },
    agentLaunch: {
      getHarnessPolicy: (input, meta) => call(APP_COMMANDS.agentLaunchGetHarnessPolicy, input, meta),
      prepare: (input, meta) => call(APP_COMMANDS.agentLaunchPrepare, input, meta),
    },
    catalog,
    files: {
      readSkillContent: (input, meta) => call(APP_COMMANDS.filesReadSkillContent, input, meta), listSupportingFiles: (input, meta) => call(APP_COMMANDS.filesListSupportingFiles, input, meta),
      readSupportingFile: (input, meta) => call(APP_COMMANDS.filesReadSupportingFile, input, meta), writeSkillContent: (input, meta) => call(APP_COMMANDS.filesWriteSkillContent, input, meta),
      listDirectory: (input, meta) => call(APP_COMMANDS.filesListDirectory, input, meta), tree: (input, meta) => call(APP_COMMANDS.filesTree, input, meta),
      stat: (input, meta) => call(APP_COMMANDS.filesStat, input, meta), delete: (input, meta) => call(APP_COMMANDS.filesDelete, input, meta),
      recover: (input, meta) => call(APP_COMMANDS.filesRecover, input, meta), reveal: (input, meta) => call(APP_COMMANDS.filesReveal, input, meta),
    },
    skills: {
      install: (input, meta) => call(APP_COMMANDS.skillsInstall, input, meta), installViaCli: (input, meta) => call(APP_COMMANDS.skillsInstallViaCli, input, meta),
      create: (input, meta) => call(APP_COMMANDS.skillsCreate, input, meta), remove: (input, meta) => call(APP_COMMANDS.skillsRemove, input, meta),
      update: (input, meta) => call(APP_COMMANDS.skillsUpdate, input, meta), removeFromAgent: (input, meta) => call(APP_COMMANDS.skillsRemoveFromAgent, input, meta),
      addToAgent: (input, meta) => call(APP_COMMANDS.skillsAddToAgent, input, meta),
    },
    remotes: {
      list: (input, meta) => call(APP_COMMANDS.remotesList, input, meta), create: (input, meta) => call(APP_COMMANDS.remotesCreate, input, meta),
      update: (input, meta) => call(APP_COMMANDS.remotesUpdate, input, meta), delete: (input, meta) => call(APP_COMMANDS.remotesDelete, input, meta),
      test: (input, meta) => call(APP_COMMANDS.remotesTest, input, meta), sync: (input, meta) => call(APP_COMMANDS.remotesSync, input, meta),
      listSkills: (input, meta) => call(APP_COMMANDS.remotesListSkills, input, meta), readSkill: (input, meta) => call(APP_COMMANDS.remotesReadSkill, input, meta),
      writeSkill: (input, meta) => call(APP_COMMANDS.remotesWriteSkill, input, meta), count: (input, meta) => call(APP_COMMANDS.remotesCount, input, meta),
      previewPush: (input, meta) => call(APP_COMMANDS.remotesPreviewPush, input, meta), applyPush: (input, meta) => call(APP_COMMANDS.remotesApplyPush, input, meta),
    },
    preferences: {
      get: (input, meta) => call(APP_COMMANDS.preferencesGet, input, meta), set: (input, meta) => call(APP_COMMANDS.preferencesSet, input, meta),
      all: (input, meta) => call(APP_COMMANDS.preferencesAll, input, meta), listFavorites: (input, meta) => call(APP_COMMANDS.preferencesListFavorites, input, meta),
      toggleFavorite: (input, meta) => call(APP_COMMANDS.preferencesToggleFavorite, input, meta),
    },
    updates: { getState: (input, meta) => call(APP_COMMANDS.updatesGetState, input, meta), check: (input, meta) => call(APP_COMMANDS.updatesCheck, input, meta), install: (input, meta) => call(APP_COMMANDS.updatesInstall, input, meta) },
    team: {
      getContext: (input, meta) => call(APP_COMMANDS.teamGetContext, input, meta), listProfiles: (input, meta) => call(APP_COMMANDS.teamListProfiles, input, meta),
      getProfileSummary: (input, meta) => call(APP_COMMANDS.teamGetProfileSummary, input, meta), apply: (input, meta) => call(APP_COMMANDS.teamApply, input, meta),
      doctor: (input, meta) => call(APP_COMMANDS.teamDoctor, input, meta), lockVerify: (input, meta) => call(APP_COMMANDS.teamLockVerify, input, meta),
      catalogDrift: (input, meta) => call(APP_COMMANDS.teamCatalogDrift, input, meta), getDriftState: (input, meta) => call(APP_COMMANDS.teamGetDriftState, input, meta),
      getLastApplyState: (input, meta) => call(APP_COMMANDS.teamGetLastApplyState, input, meta), setLastProfile: (input, meta) => call(APP_COMMANDS.teamSetLastProfile, input, meta),
    },
    terminals: { create: (input, meta) => call(APP_COMMANDS.terminalsCreate, input, meta), write: (input, meta) => call(APP_COMMANDS.terminalsWrite, input, meta), resize: (input, meta) => call(APP_COMMANDS.terminalsResize, input, meta), close: (input, meta) => call(APP_COMMANDS.terminalsClose, input, meta) },
    events: {
      async subscribe(input, listener, meta) {
        const result = await call<Subscription<typeof input.kind>>(APP_COMMANDS.eventsSubscribe, input, meta)
        if (result.ok) transport.bindEvent?.(result.data.subscriptionId, listener)
        return result
      },
      unsubscribe: (input, meta) => call(APP_COMMANDS.eventsUnsubscribe, input, meta),
    },
  }
}
