# AppAPI v1

Status: **Accepted for M0**
Contract version: `1.0`
Audience: React renderer, Tauri host, Team sidecar, tests

## Purpose

`AppAPI` is the only renderer-to-platform boundary after the Electron-to-Tauri
migration. The React application must not import Electron, Tauri plugins, Rust
bindings, Node built-ins, or sidecar transports directly. A web/dev adapter may
implement the same contract with unsupported capabilities explicitly disabled.

This document defines transport-independent semantics. IPC channel names, Tauri
command names, JSON-lines framing, and generated language bindings are adapters;
they are not the public API.

## Current-state inventory

The M0 baseline is spread across three renderer-facing files:

- `desktop/src/preload/api.d.ts` declares global DTOs and `ElectronAPI`.
- `desktop/src/preload/index.ts` maps methods to Electron `ipcRenderer.invoke`
  channels and three push-event subscriptions.
- `desktop/src/renderer/lib/electron-api.ts` exports `window.electronAPI`
  directly, so renderer code is coupled to Electron availability and naming.

The current surface covers agents; installed and remote skills; catalog search;
skill files; settings; favorites; updates; application version; Team context,
profiles, apply, doctor, lock verification, and catalog drift. Most calls return
raw values or throw transport exceptions. Team calls alone use a typed
`Result<T>`. There is no common version negotiation, capability discovery,
cancellation, correlation identifier, idempotency contract, or event ordering
contract.

AppAPI v1 replaces those implicit behaviors without requiring every capability
to ship in M0.

## Shape and version negotiation

The renderer obtains one object named `appAPI`. The Tauri adapter may expose it
as a TypeScript module; it must not add a second global API.

```ts
interface AppAPI {
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

interface AppDescription {
  contract: { major: 1; minor: number }
  implementation: { name: string; version: string; platform: string; arch: string }
  capabilities: Record<CapabilityId, CapabilityDescriptor>
}
```

Major versions are incompatible. The renderer refuses normal operation when
`contract.major !== 1` and shows a deterministic upgrade error. A higher minor
version is accepted; the renderer uses only advertised capabilities. Additive
DTO fields and new capabilities increment the minor version. Removing or
changing a field, error meaning, ordering rule, or side effect requires a new
major version.

## Capability model

Each feature is independently discoverable. Presence of a namespace does not
mean that its operations are available.

```ts
type CapabilityState = "available" | "unavailable" | "degraded"

interface CapabilityDescriptor {
  state: CapabilityState
  version: string
  operations: string[]
  reason?: AppError
}
```

The v1 capability identifiers are:

| Capability | Required operations |
| --- | --- |
| `app.identity` | describe app and contract versions, get application version |
| `agents.discovery` | detect installed harnesses |
| `agents.launch` | select catalog agent, validate harness/model, prepare structured launch |
| `catalog.local` | scan, list, search, filter and watch skills/agents/rules/context |
| `catalog.remote` | search, trending and fetch remote content |
| `files.workspace` | tree, read, write, delete and reveal within granted roots |
| `skills.manage` | create, install, update, remove and link to agents |
| `remotes.ssh` | server CRUD, connection test, sync, preview and apply push |
| `preferences.local` | typed settings and favorites |
| `updates.signed` | state, check, download/install and progress events |
| `team.workflows` | context, profiles, apply, doctor, lock and drift |
| `terminals.pty` | create, input, resize, close and ordered output |

`unavailable` is a supported state, not an exception. Calls to an unavailable
operation return `CAPABILITY_UNAVAILABLE`.

## Complete TypeScript wire contract

The following declarations are normative. Contract tests use these exact method
names, inputs, outputs, tagged unions and event payloads. `EmptyInput` is used
instead of an omitted input so every adapter serializes the same call shape.

```ts
type JsonValue = null | boolean | number | string | JsonValue[] |
  { [key: string]: JsonValue }
type CapabilityId =
  | "app.identity" | "agents.discovery" | "agents.launch" | "catalog.local"
  | "catalog.remote" | "files.workspace" | "skills.manage"
  | "remotes.ssh" | "preferences.local" | "updates.signed"
  | "team.workflows" | "terminals.pty"
type EmptyInput = Record<string, never>
interface EmptyOutput { value: null }

interface PathRef {
  grantId: string
  relativePath: string
}

interface DescribeInput { requestedMajor?: number }
interface CancelInput { requestId: RequestId }
interface CancelReceipt {
  requestId: RequestId
  status: "requested" | "already_finished" | "unknown"
}
interface MutationReceipt {
  committed: boolean
  idempotencyKey: string
  replayed: boolean
}

interface ApplicationAPI {
  getVersion(input: EmptyInput, meta: RequestMeta): Promise<AppResult<string>>
}

interface DetectedAgent {
  name: string
  displayName: string
  shortCode: string
}
interface AgentsAPI {
  detect(input: EmptyInput, meta: RequestMeta): Promise<AppResult<DetectedAgent[]>>
}

type SkillScope = "global" | "project" | "custom"
interface SupportingFile { relativePath: string; size: number }
interface InstalledSkill {
  itemId: string
  name: string
  description: string
  location: PathRef
  canonicalItemId: string
  agents: string[]
  agentShortCodes: string[]
  scope: SkillScope
  projectName: string | null
  hasSupportingFiles: boolean
  supportingFiles: SupportingFile[]
  source?: string
  sourceType?: string
  installedAt?: string
  updatedAt?: string
}
interface CatalogSkill {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
  isOfficial?: boolean
}
interface ListInstalledInput { grantId?: string }
interface RescanCatalogInput { grantId?: string; force?: boolean }
interface SearchCatalogInput { query: string; limit?: number; offset?: number }
interface SearchCatalogOutput { skills: CatalogSkill[]; count: number }
interface FetchSkillContentInput { source: string; skillId: string }

type CatalogKind = "skill" | "agent" | "rule" | "context"
type CatalogPlatform = "cursor" | "claude" | "codex" | "shared"
type CatalogScope = "global" | "project"
interface RootGrant {
  grantId: string
  displayName: string
  persisted: boolean
}
interface SelectCatalogRootInput {
  source: "home" | "picker"
  previousGrantId?: string
}
interface CatalogAlias { location: PathRef; displayPath: string }
interface CatalogItem {
  itemId: string
  canonicalItemId: string
  kind: CatalogKind
  platform: CatalogPlatform
  scope: CatalogScope
  projectName: string | null
  groupId: string
  groupLabel: string
  pluginName?: string
  name: string
  slug: string
  description: string
  creator?: string
  location: PathRef
  displayPath: string
  aliases: CatalogAlias[]
  createdAt: string | null
  modifiedAt: string
}
interface CatalogGroup {
  groupId: string
  label: string
  kind: CatalogKind
  platform: CatalogPlatform
  itemIds: string[]
}
interface CatalogSummary {
  total: number
  byKind: Record<CatalogKind, number>
  byPlatform: Record<CatalogPlatform, number>
  byScope: Record<CatalogScope, number>
  projectNames: string[]
}
interface CatalogSnapshot {
  grant: RootGrant
  revision: string
  groups: CatalogGroup[]
  items: CatalogItem[]
  summary: CatalogSummary
  skippedUnreadable: number
}
interface CatalogFilter {
  query?: string
  kinds?: CatalogKind[]
  platforms?: CatalogPlatform[]
  scopes?: CatalogScope[]
  projectNames?: string[]
  groupIds?: string[]
}
interface ScanCatalogInput { grantId: string; force?: boolean }
interface ListCatalogInput {
  grantId: string
  filter?: CatalogFilter
  offset?: number
  limit?: number
}
interface ListCatalogOutput {
  revision: string
  groups: CatalogGroup[]
  items: CatalogItem[]
  summary: CatalogSummary
  totalMatched: number
}
interface GetCatalogItemInput { grantId: string; itemId: string }
interface WatchCatalogInput { grantId: string; afterRevision?: string }
interface CatalogAPI {
  selectRoot(input: SelectCatalogRootInput, meta: RequestMeta):
    Promise<AppResult<RootGrant | null>>
  scan(input: ScanCatalogInput, meta: RequestMeta):
    Promise<AppResult<CatalogSnapshot>>
  list(input: ListCatalogInput, meta: RequestMeta):
    Promise<AppResult<ListCatalogOutput>>
  search(input: ListCatalogInput, meta: RequestMeta):
    Promise<AppResult<ListCatalogOutput>>
  getItem(input: GetCatalogItemInput, meta: RequestMeta):
    Promise<AppResult<CatalogItem>>
  watch(input: WatchCatalogInput, meta: RequestMeta):
    Promise<AppResult<Subscription<"catalog.changed">>>
  listInstalled(input: ListInstalledInput, meta: RequestMeta):
    Promise<AppResult<InstalledSkill[]>>
  rescan(input: RescanCatalogInput, meta: RequestMeta):
    Promise<AppResult<InstalledSkill[]>>
  searchRemote(input: SearchCatalogInput, meta: RequestMeta):
    Promise<AppResult<SearchCatalogOutput>>
  fetchTrending(input: EmptyInput, meta: RequestMeta):
    Promise<AppResult<CatalogSkill[]>>
  fetchSkillContent(input: FetchSkillContentInput, meta: RequestMeta):
    Promise<AppResult<string | null>>
}

interface ReadSkillContentInput { location: PathRef }
interface ListSupportingFilesInput { skill: PathRef }
interface ReadSupportingFileInput { skill: PathRef; relativePath: string }
interface WriteSkillContentInput {
  location: PathRef
  content: string
  expectedRevision?: string
}
interface WriteSkillContentOutput { revision: string; receipt: MutationReceipt }
interface RevealFileInput { location: PathRef }
interface ListDirectoryInput { directory: PathRef; depth?: number }
interface FileTreeEntry {
  entryId: string
  name: string
  location: PathRef
  kind: "file" | "directory" | "symlink"
  size: number | null
  modifiedAt: string
  children?: FileTreeEntry[]
}
interface StatFileInput { location: PathRef }
interface FileStat {
  location: PathRef
  kind: "file" | "directory" | "symlink"
  size: number
  createdAt: string | null
  modifiedAt: string
  revision: string
}
interface DeleteFileInput {
  location: PathRef
  expectedRevision?: string
  recovery: "trash" | "quarantine"
}
interface DeleteFileOutput {
  recoveryToken: string
  recoverableUntil?: string
  receipt: MutationReceipt
}
interface RecoverFileInput { recoveryToken: string }
interface FilesAPI {
  readSkillContent(input: ReadSkillContentInput, meta: RequestMeta):
    Promise<AppResult<string>>
  listSupportingFiles(input: ListSupportingFilesInput, meta: RequestMeta):
    Promise<AppResult<SupportingFile[]>>
  readSupportingFile(input: ReadSupportingFileInput, meta: RequestMeta):
    Promise<AppResult<string>>
  writeSkillContent(input: WriteSkillContentInput, meta: RequestMeta):
    Promise<AppResult<WriteSkillContentOutput>>
  listDirectory(input: ListDirectoryInput, meta: RequestMeta):
    Promise<AppResult<FileTreeEntry[]>>
  tree(input: ListDirectoryInput, meta: RequestMeta):
    Promise<AppResult<FileTreeEntry>>
  stat(input: StatFileInput, meta: RequestMeta): Promise<AppResult<FileStat>>
  delete(input: DeleteFileInput, meta: RequestMeta):
    Promise<AppResult<DeleteFileOutput>>
  recover(input: RecoverFileInput, meta: RequestMeta):
    Promise<AppResult<{ location: PathRef; receipt: MutationReceipt }>>
  reveal(input: RevealFileInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
}

type SkillSource =
  | { kind: "catalog"; sourceId: string; skillId: string }
  | { kind: "url"; url: string }
  | { kind: "local"; location: PathRef }
interface InstallSkillInput {
  source: SkillSource
  targetAgentIds: string[]
  scope: SkillScope
}
interface InstallResult {
  skillName: string
  agent: string
  success: boolean
  location: PathRef
  error?: string
}
interface InstallSkillViaCliInput { source: SkillSource }
interface InstallSkillViaCliOutput { success: boolean; output: string; error?: string }
interface CreateSkillInput {
  name: string
  description?: string
  content?: string
  agentNames?: string[]
}
interface CreateSkillOutput {
  name: string
  location: PathRef
  targets: string[]
  receipt: MutationReceipt
}
interface SkillNameInput { name: string }
interface RemoveFromAgentInput { skillName: string; agentName: string }
interface AddToAgentInput {
  skillName: string
  canonicalItemId: string
  targetAgentId: string
}
interface SkillsAPI {
  install(input: InstallSkillInput, meta: RequestMeta):
    Promise<AppResult<InstallResult[]>>
  installViaCli(input: InstallSkillViaCliInput, meta: RequestMeta):
    Promise<AppResult<InstallSkillViaCliOutput>>
  create(input: CreateSkillInput, meta: RequestMeta):
    Promise<AppResult<CreateSkillOutput>>
  remove(input: SkillNameInput, meta: RequestMeta):
    Promise<AppResult<MutationReceipt>>
  update(input: SkillNameInput, meta: RequestMeta):
    Promise<AppResult<MutationReceipt>>
  removeFromAgent(input: RemoveFromAgentInput, meta: RequestMeta):
    Promise<AppResult<MutationReceipt>>
  addToAgent(input: AddToAgentInput, meta: RequestMeta):
    Promise<AppResult<MutationReceipt>>
}

interface RemoteServer {
  id: string
  label: string
  host: string
  port: number
  username: string
  skillsBasePath: string
  sshKeyRef: PathRef | null
  lastSyncAt: string | null
  lastSyncError: string | null
  createdAt: string
  skillCount?: number
}
interface RemoteSkill {
  id: string
  serverId: string
  name: string
  description: string | null
  remotePath: string
  content: string | null
  contentHash: string | null
  syncedAt: string
}
interface CreateServerInput {
  label: string
  host: string
  port?: number
  username: string
  skillsBasePath?: string
  sshKeyRef?: PathRef | null
}
interface UpdateServerInput { id: string; fields: Partial<CreateServerInput> }
interface ServerIdInput { id: string }
interface ServerPathInput { serverId: string; remotePath: string }
interface WriteRemoteSkillInput extends ServerPathInput { content: string }
interface SyncResult {
  added: number
  updated: number
  removed: number
  unchanged: number
  error?: string
}
type PushReason = "added" | "updated" | "deleted" | "unchanged"
interface PushPlanEntry {
  folderName: string
  name: string
  localItemId: string
  localLocation: PathRef
  remotePath: string
  remoteDir: string
  reason: PushReason
  localHash?: string
  remoteHash?: string
}
interface PushPreviewInput { serverId: string; mirror: boolean }
interface PushPreview {
  toAdd: PushPlanEntry[]
  toUpdate: PushPlanEntry[]
  toDelete: PushPlanEntry[]
  unchanged: PushPlanEntry[]
  mirror: boolean
}
interface PushApplyInput { serverId: string; preview: PushPreview }
interface PushApplyOutput {
  added: number
  updated: number
  deleted: number
  unchanged: number
  errors: Array<{ folderName: string; message: string }>
  receipt: MutationReceipt
}
interface RemotesAPI {
  list(input: EmptyInput, meta: RequestMeta): Promise<AppResult<RemoteServer[]>>
  create(input: CreateServerInput, meta: RequestMeta): Promise<AppResult<RemoteServer>>
  update(input: UpdateServerInput, meta: RequestMeta): Promise<AppResult<RemoteServer | null>>
  delete(input: ServerIdInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  test(input: ServerIdInput, meta: RequestMeta):
    Promise<AppResult<{ ok: boolean; error?: string }>>
  sync(input: ServerIdInput, meta: RequestMeta): Promise<AppResult<SyncResult>>
  listSkills(input: { serverId: string }, meta: RequestMeta):
    Promise<AppResult<RemoteSkill[]>>
  readSkill(input: ServerPathInput, meta: RequestMeta): Promise<AppResult<string>>
  writeSkill(input: WriteRemoteSkillInput, meta: RequestMeta):
    Promise<AppResult<{ receipt: MutationReceipt }>>
  count(input: EmptyInput, meta: RequestMeta): Promise<AppResult<number>>
  previewPush(input: PushPreviewInput, meta: RequestMeta): Promise<AppResult<PushPreview>>
  applyPush(input: PushApplyInput, meta: RequestMeta): Promise<AppResult<PushApplyOutput>>
}

interface SettingGetInput<T extends JsonValue> { key: string; defaultValue: T }
interface SettingSetInput { key: string; value: JsonValue }
interface FavoriteNameInput { name: string }
interface PreferencesAPI {
  get<T extends JsonValue>(input: SettingGetInput<T>, meta: RequestMeta):
    Promise<AppResult<T>>
  set(input: SettingSetInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
  all(input: EmptyInput, meta: RequestMeta):
    Promise<AppResult<Record<string, JsonValue>>>
  listFavorites(input: EmptyInput, meta: RequestMeta): Promise<AppResult<string[]>>
  toggleFavorite(input: FavoriteNameInput, meta: RequestMeta): Promise<AppResult<boolean>>
}

type UpdateStatus = "idle" | "checking" | "available" | "downloading" |
  "downloaded" | "not-available" | "error"
interface UpdateState {
  status: UpdateStatus
  version: string
  availableVersion?: string
  downloadedVersion?: string
  progressPercent?: number
  message?: string
}
interface UpdatesAPI {
  getState(input: EmptyInput, meta: RequestMeta): Promise<AppResult<UpdateState>>
  check(input: EmptyInput, meta: RequestMeta): Promise<AppResult<UpdateState>>
  install(input: EmptyInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
}

type TeamProfileSource = "explicit" | "linked_project" | "settings" |
  "cwd" | "default"
interface TeamContextInput {
  teamRootGrantId?: string
  linkedProjectGrantId?: string
  profile?: string
}
interface TeamContext {
  teamRoot: PathRef
  linkedProject?: PathRef
  effectiveProfile: string
  profileSource: TeamProfileSource
}
interface TeamProfileSummary {
  name: string
  description?: string
  skillCount: number
  agents?: string[]
}
interface TeamProfileSummaryInput extends TeamContextInput { profile: string }
interface TeamDriftItem {
  skill: string
  kind: string
  expected?: string
  actual?: string
  location?: PathRef
  agent?: string
}
interface TeamDoctorResult {
  ok: boolean
  profile: string
  drifts: TeamDriftItem[]
  agentCount: number
  teamRoot: PathRef
}
interface TeamDoctorInput extends TeamContextInput {}
interface TeamLockMismatch { skill: string; lockHash: string | null; diskHash: string }
interface TeamLockVerifyResult {
  ok: boolean
  mismatches: TeamLockMismatch[]
  mismatchCount: number
  updated: boolean
}
interface TeamLockVerifyInput extends TeamContextInput { write?: boolean }
interface TeamApplySkillResult {
  skill: string
  agent: string
  success: boolean
  error?: string
}
interface TeamApplyResult {
  profile: string
  installed: number
  failed: number
  skipped: string[]
  method: string
  agents: string[]
  results: TeamApplySkillResult[]
  lockUpdated: boolean
}
interface TeamApplyInput extends TeamContextInput {
  upgrade?: boolean
  writeLock?: boolean
  dryRun?: boolean
}
interface TeamCatalogDriftResult {
  status: "ok" | "behind" | "unknown"
  fromCache: boolean
  localVersion?: string
  remoteVersion?: string
  message?: string
}
interface TeamCatalogDriftInput extends TeamContextInput { force?: boolean }
interface TeamDriftState extends TeamCatalogDriftResult { error?: string }
interface TeamLastApplyState {
  appliedAt: string
  profile: string
  revision: number
  teamRoot: PathRef
  method: string
  agents: string[]
}
interface TeamSetLastProfileInput { profile: string }
interface TeamAPI {
  getContext(input: TeamContextInput, meta: RequestMeta): Promise<AppResult<TeamContext>>
  listProfiles(input: TeamContextInput, meta: RequestMeta): Promise<AppResult<string[]>>
  getProfileSummary(input: TeamProfileSummaryInput, meta: RequestMeta):
    Promise<AppResult<TeamProfileSummary>>
  apply(input: TeamApplyInput, meta: RequestMeta): Promise<AppResult<TeamApplyResult>>
  doctor(input: TeamDoctorInput, meta: RequestMeta): Promise<AppResult<TeamDoctorResult>>
  lockVerify(input: TeamLockVerifyInput, meta: RequestMeta):
    Promise<AppResult<TeamLockVerifyResult>>
  catalogDrift(input: TeamCatalogDriftInput, meta: RequestMeta):
    Promise<AppResult<TeamCatalogDriftResult>>
  getDriftState(input: EmptyInput, meta: RequestMeta):
    Promise<AppResult<TeamDriftState | null>>
  getLastApplyState(input: EmptyInput, meta: RequestMeta):
    Promise<AppResult<TeamLastApplyState | null>>
  setLastProfile(input: TeamSetLastProfileInput, meta: RequestMeta):
    Promise<AppResult<MutationReceipt>>
}

type AgentHarness = "cursor" | "claude-code" | "codex"
type HarnessModel =
  | "auto" | "composer-2.5" | "opus-4.8" | "fable-5" | "sonnet-5"
  | "gpt-5-5" | "sonnet-4.6" | "haiku-4.5" | "o3"
  | "gpt-5-codex" | "codex-mini"
interface AgentCatalogSelection {
  itemId: string
  canonicalItemId: string
  name: string
  slug: string
  platform: CatalogPlatform
  location: PathRef
}
interface HarnessPolicy {
  harness: AgentHarness
  installed: boolean
  models: HarnessModel[]
  defaultModel: HarnessModel
  missingCliGuidance?: string
}
interface GetHarnessPolicyInput { agentItemId: string }
interface PrepareAgentLaunchInput {
  agent: AgentCatalogSelection
  harness: AgentHarness
  model: HarnessModel
  prompt?: string
  cwd: PathRef
}
interface PreparedAgentLaunch {
  preparedLaunchId: string
  agent: AgentCatalogSelection
  harness: AgentHarness
  model: HarnessModel
  normalizedPrompt: string | null
  cwd: PathRef
  executableIdentity: string
  argv: string[]
  expiresAt: string
}
interface AgentLaunchAPI {
  getHarnessPolicy(input: GetHarnessPolicyInput, meta: RequestMeta):
    Promise<AppResult<HarnessPolicy[]>>
  prepare(input: PrepareAgentLaunchInput, meta: RequestMeta):
    Promise<AppResult<PreparedAgentLaunch>>
}

interface CreateTerminalInput {
  preparedLaunchId: string
  columns: number
  rows: number
}
interface TerminalSession { terminalId: string; pid: number; startedAt: string }
interface TerminalInput { terminalId: string; data: string }
interface ResizeTerminalInput { terminalId: string; columns: number; rows: number }
interface TerminalIdInput { terminalId: string }
interface TerminalsAPI {
  create(input: CreateTerminalInput, meta: RequestMeta): Promise<AppResult<TerminalSession>>
  write(input: TerminalInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
  resize(input: ResizeTerminalInput, meta: RequestMeta): Promise<AppResult<EmptyOutput>>
  close(input: TerminalIdInput, meta: RequestMeta): Promise<AppResult<MutationReceipt>>
}

type EventKind = "catalog.scan-start" | "catalog.changed" |
  "catalog.scan-complete" | "catalog.scan-error" | "skills.updated" |
  "updates.state" | "team.drift-state" | "terminal.output" | "terminal.exit"
interface EventPayloadMap {
  "catalog.scan-start": { grantId: string; previousRevision?: string }
  "catalog.changed": {
    grantId: string
    revision: string
    reason: "scan" | "filesystem" | "mutation"
    summary: CatalogSummary
    changedItemIds: string[]
    removedItemIds: string[]
  }
  "catalog.scan-complete": { snapshot: CatalogSnapshot }
  "catalog.scan-error": { grantId: string; error: AppError }
  "skills.updated": { skills: InstalledSkill[]; snapshotRevision: string }
  "updates.state": { state: UpdateState }
  "team.drift-state": { state: TeamDriftState }
  "terminal.output": { terminalId: string; data: string }
  "terminal.exit": { terminalId: string; exitCode: number | null; signal?: string }
}
interface SubscribeInput<K extends EventKind> {
  kind: K
  terminalId?: string
  afterRevision?: string
}
interface Subscription<K extends EventKind> {
  subscriptionId: string
  snapshotRevision?: string
  initial?: EventPayloadMap[K]
}
interface UnsubscribeInput { subscriptionId: string }
type EventListener<K extends EventKind> =
  (event: AppEvent<EventPayloadMap[K]>) => void
interface EventsAPI {
  subscribe<K extends EventKind>(
    input: SubscribeInput<K>,
    listener: EventListener<K>,
    meta: RequestMeta,
  ): Promise<AppResult<Subscription<K>>>
  unsubscribe(input: UnsubscribeInput, meta: RequestMeta):
    Promise<AppResult<EmptyOutput>>
}
```

### Legacy preload method mapping

Every current preload operation has one v1 destination. Compatibility adapters
must implement all rows before deleting `window.electronAPI`.

| Current method | AppAPI v1 destination |
| --- | --- |
| `detectAgents` | `agents.detect` |
| `listInstalled` / `rescanSkills` | `catalog.listInstalled` / `catalog.rescan` |
| `searchCatalog` / `fetchTrending` / `fetchSkillContent` | `catalog.searchRemote` / `catalog.fetchTrending` / `catalog.fetchSkillContent` |
| `installSkill` / `installSkillViaCli` | `skills.install` / `skills.installViaCli` |
| `createSkill` / `removeSkill` / `updateSkill` | `skills.create` / `skills.remove` / `skills.update` |
| `readSkillContent` / `listSupportingFiles` / `readSupportingFile` | `files.readSkillContent` / `files.listSupportingFiles` / `files.readSupportingFile` |
| `writeSkillContent` / `openInFinder` | `files.writeSkillContent` / `files.reveal` |
| `removeFromAgent` / `addToAgent` | `skills.removeFromAgent` / `skills.addToAgent` |
| `serversList` / `serversCreate` / `serversUpdate` / `serversDelete` | `remotes.list` / `remotes.create` / `remotes.update` / `remotes.delete` |
| `serversTest` / `serversSync` / `serversSkills` | `remotes.test` / `remotes.sync` / `remotes.listSkills` |
| `serversReadSkill` / `serversWriteSkill` / `serversCount` | `remotes.readSkill` / `remotes.writeSkill` / `remotes.count` |
| `serversPushPreview` / `serversPushApply` | `remotes.previewPush` / `remotes.applyPush` |
| `settingsGet` / `settingsSet` / `settingsAll` | `preferences.get` / `preferences.set` / `preferences.all` |
| `favoritesList` / `favoritesToggle` | `preferences.listFavorites` / `preferences.toggleFavorite` |
| `updatesGetState` / `updatesCheck` / `updatesInstall` | `updates.getState` / `updates.check` / `updates.install` |
| `appGetVersion` | `application.getVersion` |
| `onSkillsUpdated` / `onUpdateState` | `events.subscribe("skills.updated")` / `events.subscribe("updates.state")` |
| `teamGetContext` / `teamListProfiles` / `teamGetProfileSummary` | `team.getContext` / `team.listProfiles` / `team.getProfileSummary` |
| `teamApply` / `teamDoctor` / `teamLockVerify` | `team.apply` / `team.doctor` / `team.lockVerify` |
| `teamCatalogDrift` / `teamGetDriftState` | `team.catalogDrift` / `team.getDriftState` |
| `teamGetLastApplyState` / `teamSetLastProfile` | `team.getLastApplyState` / `team.setLastProfile` |
| `onTeamDriftState` | `events.subscribe("team.drift-state")` |

The old Electron signatures that accept `path`, `filePath`, `canonicalPath`,
`localPath`, `teamRoot`, `linkedProject`, or `sshKeyPath` are **deprecated,
adapter-internal inputs**. They are not AppAPI DTOs and must never cross the
target renderer wire boundary. The temporary Electron compatibility adapter may
receive them only from unchanged legacy renderer code; it immediately resolves
them against an already granted root, converts them to `PathRef` or a catalog
item ID, and rejects values outside that grant. It cannot mint a grant from an
arbitrary string. New renderer code cannot import or construct legacy DTOs.

Remote `remotePath`, `remoteDir`, and `skillsBasePath` fields name paths on the
configured SSH server and are validated by the remote-server boundary; they are
not local filesystem authority. Preferences reject reserved path-bearing keys;
root and credential selection always use the host picker and a grant/reference.

## Request and response envelope

Every operation except `describe` accepts `RequestMeta` as its final argument.
Adapters create missing optional values before crossing the platform boundary.

```ts
type RequestId = string
type CorrelationId = string

interface RequestMeta {
  requestId: RequestId          // unique UUID for this attempt
  correlationId: CorrelationId  // stable across a user action and its child calls
  idempotencyKey?: string       // required for retryable mutations
  deadlineMs?: number           // relative, monotonic deadline
}

type AppResult<T> =
  | { ok: true; data: T; meta: ResponseMeta }
  | { ok: false; error: AppError; meta: ResponseMeta }

interface ResponseMeta {
  requestId: RequestId
  correlationId: CorrelationId
  completedAt: string
  revision?: string
  mutation?: {
    committed: boolean
    idempotencyKey: string
    replayed: boolean
  }
}
```

Transport exceptions are converted at the adapter boundary into
`TRANSPORT_UNAVAILABLE`; renderer feature code never relies on thrown strings.
Programming errors in the renderer may still throw.

Correlation IDs flow renderer -> Tauri command -> sidecar/PTY/filesystem ->
structured logs and resulting events. Secrets, file content, terminal output,
SSH material, and arbitrary prompts must not be placed in IDs or logs.

## Error taxonomy

```ts
type AppErrorCode =
  | "INVALID_ARGUMENT" | "INVALID_STATE" | "UNSUPPORTED_VERSION"
  | "CAPABILITY_UNAVAILABLE" | "TRANSPORT_UNAVAILABLE"
  | "SIDECAR_UNAVAILABLE" | "PATH_NOT_GRANTED" | "PATH_ESCAPE"
  | "SYMLINK_ESCAPE" | "PERMISSION_DENIED" | "NOT_FOUND"
  | "ALREADY_EXISTS" | "REVISION_CONFLICT" | "WRITER_BUSY"
  | "CANCELLED" | "DEADLINE_EXCEEDED" | "NETWORK_UNAVAILABLE"
  | "REMOTE_AUTH_FAILED" | "REMOTE_OPERATION_FAILED"
  | "PROCESS_START_FAILED" | "PROCESS_EXITED"
  | "UPDATE_VERIFICATION_FAILED" | "TEAM_ROOT_MISSING"
  | "PROFILE_NOT_FOUND" | "NO_AGENTS" | "APPLY_PARTIAL_FAIL"
  | "LOCK_MISMATCH" | "NETWORK_TIMEOUT" | "INTERNAL"

interface AppError {
  code: AppErrorCode
  message: string
  category: "validation" | "authorization" | "conflict" | "not_found" |
    "cancelled" | "timeout" | "unavailable" | "external" | "internal"
  retryable: boolean
  details?: Record<string, unknown>
}
```

Stable v1 codes:

- `INVALID_ARGUMENT`, `INVALID_STATE`, `UNSUPPORTED_VERSION`
- `CAPABILITY_UNAVAILABLE`, `TRANSPORT_UNAVAILABLE`, `SIDECAR_UNAVAILABLE`
- `PATH_NOT_GRANTED`, `PATH_ESCAPE`, `SYMLINK_ESCAPE`, `PERMISSION_DENIED`
- `NOT_FOUND`, `ALREADY_EXISTS`, `REVISION_CONFLICT`, `WRITER_BUSY`
- `CANCELLED`, `DEADLINE_EXCEEDED`
- `NETWORK_UNAVAILABLE`, `REMOTE_AUTH_FAILED`, `REMOTE_OPERATION_FAILED`
- `PROCESS_START_FAILED`, `PROCESS_EXITED`, `UPDATE_VERIFICATION_FAILED`
- `TEAM_ROOT_MISSING`, `PROFILE_NOT_FOUND`, `NO_AGENTS`,
  `APPLY_PARTIAL_FAIL`, `LOCK_MISMATCH`, `NETWORK_TIMEOUT`
- `INTERNAL`

Existing Team error codes retain their current meanings and are mapped without
loss. `details` is machine-readable and must not be parsed from `message`.
Unknown backend codes map to `INTERNAL` while preserving a sanitized original
code in `details.backendCode`.

## Cancellation and deadlines

- Cancellation is cooperative and addressed by `requestId`.
- `cancel` is idempotent. It returns whether the request was `requested`,
  `already_finished`, or `unknown`.
- A cancelled operation returns `CANCELLED`; an expired operation returns
  `DEADLINE_EXCEEDED`. Both retain the original correlation ID.
- Cancellation does not imply rollback. Mutation DTOs state whether the commit
  point was reached. Atomic writes use write-temp, fsync, rename; cancellation
  is honored before rename and ignored during the commit section.
- Process and terminal cancellation must terminate the owned process tree and
  emit its final lifecycle event.
- Dropping a renderer subscription does not cancel the operation that produced
  the stream.

## Idempotency and retries

Reads are side-effect free and may be retried with a new request ID under the
same correlation ID. Mutations that can be retried after an ambiguous transport
failure require an `idempotencyKey`:

- file write/delete, skill create/install/update/remove/link;
- server create/update/delete/sync/push;
- Team apply and lock write;
- updater install; terminal create/close.

The owning backend stores a bounded receipt keyed by
`(operation, idempotencyKey)` and returns the original outcome for an identical
payload. Reuse with a different payload returns `INVALID_ARGUMENT`. Receipt
retention is at least 24 hours or the documented operation lifetime, whichever
is longer. Preview, dry-run, list, search, read, doctor and connection-test calls
do not require a key.

## Events and ordering

```ts
interface AppEvent<T> {
  kind: EventKind
  stream: string
  subscriptionId: string
  sequence: number
  emittedAt: string
  correlationId?: string
  revision?: string
  payload: T
}
```

- Sequence numbers are strictly increasing per `subscriptionId`, beginning at
  `1`. Ordering across subscriptions is deliberately undefined.
- Delivery is at-most-once. A detected sequence gap requires a snapshot reload;
  clients must not infer missing state.
- Subscribe returns the current snapshot/revision before live events. Events
  with an older or equal revision are ignored.
- A successful mutation response is observable before any causally generated
  event is delivered to that same renderer subscription.
- Terminal output preserves byte order for one PTY. Exit is the final event;
  no output may follow it.
- Unsubscribe is idempotent and prevents future callback invocation after its
  completion.

The existing `skills:updated`, `updates:state`, and `team:drift-state` broadcasts
become versioned streams under this rule.

## DTO ownership

Canonical AppAPI DTOs and schemas belong to a transport-neutral contract module
under the desktop application, not to preload, renderer routes, Rust commands,
or the Team sidecar. TypeScript and Rust bindings are generated or verified from
the same versioned schema. Boundary tests serialize fixtures in both directions.

Domain ownership remains explicit:

- `team-api` owns Team input/output domain types and semantics. AppAPI exposes
  compatible wire DTOs and maps them at the adapter edge.
- Rust owns platform DTOs for granted paths, filesystem entries, processes,
  terminals, updates and persistence receipts.
- Renderer-only view models stay in the renderer and never become wire DTOs.
- Remote provider payloads are normalized at the host boundary; raw third-party
  responses are not AppAPI contracts.

Wire DTO rules: JSON-compatible values only; UTF-8 strings; RFC 3339 UTC
timestamps; explicit nullable fields; opaque IDs instead of native paths as
long-lived identity; tagged unions instead of sentinel strings; byte counts as
safe integers. Additive fields must be optional until the next major version.

## Security boundary

All filesystem operations use a Tauri-maintained grant identifier and a relative
path. Renderer-supplied absolute paths are always rejected. An explicit OS
folder picker runs in the host and returns only a `RootGrant`; it never returns a
native absolute path to the renderer. The host resolves and canonicalizes every
component, rejects traversal and symlink escape, and rechecks the target at
commit time. Sidecar and terminal inputs are structured arguments, never
shell-concatenated commands.

## Compatibility mapping

During migration, a compatibility adapter may implement `AppAPI` over the
existing Electron channels. New renderer code imports only `appAPI`; direct use
of `window.electronAPI` is prohibited. Electron and Tauri adapters must pass the
same contract fixtures. A feature can switch only after result, error,
cancellation (when applicable), idempotency, and event-order tests pass.

## M0 acceptance evidence

- The inventory above is traceable to the three current facade files.
- Contract fixtures cover success, every error category, version mismatch,
  cancellation after commit, duplicate idempotency keys, and event gaps.
- Electron compatibility and Tauri implementations report contract major `1`.
- No renderer route imports a platform-specific API after its feature cutover.
