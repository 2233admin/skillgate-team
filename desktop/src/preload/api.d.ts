export {}

declare global {
  interface DetectedAgent {
    name: string
    displayName: string
    shortCode: string
  }

  interface InstalledSkill {
    name: string
    description: string
    path: string
    canonicalPath: string
    agents: string[]
    agentShortCodes: string[]
    scope: "global" | "project" | "custom"
    projectName: string | null
    hasSupportingFiles: boolean
    supportingFiles: Array<{
      relativePath: string
      size: number
    }>
    source?: string
    sourceType?: string
    installedAt?: string
    updatedAt?: string
  }

  interface InstallResult {
    skillName: string
    agent: string
    success: boolean
    path: string
    error?: string
  }

  // Remote server types
  interface RemoteServer {
    id: string
    label: string
    host: string
    port: number
    username: string
    skillsBasePath: string
    sshKeyPath: string | null
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

  interface SyncResult {
    added: number
    updated: number
    removed: number
    unchanged: number
    error?: string
  }

  interface PushPlanEntry {
    folderName: string
    name: string
    localPath: string
    remotePath: string
    remoteDir: string
    reason: "added" | "updated" | "deleted" | "unchanged"
    localHash?: string
    remoteHash?: string
  }

  type TeamProfileSource =
    | "explicit"
    | "linked_project"
    | "settings"
    | "cwd"
    | "default"

  interface TeamContext {
    teamRoot: string
    linkedProject?: string
    effectiveProfile: string
    profileSource: TeamProfileSource
  }

  interface TeamError {
    code: string
    message: string
    details?: unknown
  }

  type TeamResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: TeamError }

  interface TeamProfileSummary {
    name: string
    description?: string
    skillCount: number
    agents?: string[]
  }

  interface TeamDriftItem {
    skill: string
    kind: string
    expected?: string
    actual?: string
    path?: string
    agent?: string
  }

  interface TeamDoctorResult {
    ok: boolean
    profile: string
    drifts: TeamDriftItem[]
    agentCount: number
    teamRoot: string
  }

  interface TeamLockMismatch {
    skill: string
    lockHash: string | null
    diskHash: string
  }

  interface TeamLockVerifyResult {
    ok: boolean
    mismatches: TeamLockMismatch[]
    mismatchCount: number
    updated: boolean
  }

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

  interface TeamCatalogDriftResult {
    status: "ok" | "behind" | "unknown"
    fromCache: boolean
    localVersion?: string
    remoteVersion?: string
    message?: string
  }

  interface TeamDriftState {
    status: "ok" | "behind" | "unknown"
    fromCache: boolean
    localVersion?: string
    remoteVersion?: string
    message?: string
    error?: string
  }

  interface TeamLastApplyState {
    appliedAt: string
    profile: string
    revision: number
    teamRoot: string
    method: string
    agents: string[]
  }

  interface UpdateState {
    status:
      | "idle"
      | "checking"
      | "available"
      | "downloading"
      | "downloaded"
      | "not-available"
      | "error"
    version: string
    availableVersion?: string
    downloadedVersion?: string
    progressPercent?: number
    message?: string
  }

  interface ElectronAPI {
    detectAgents: () => Promise<DetectedAgent[]>
    listInstalled: () => Promise<InstalledSkill[]>
    rescanSkills: () => Promise<InstalledSkill[]>
    installSkill: (
      source: string,
      agents: string[],
      scope: string,
    ) => Promise<InstallResult[]>
    installSkillViaCli: (
      source: string,
    ) => Promise<{ success: boolean; output: string; error?: string }>
    searchCatalog: (
      query: string,
      limit?: number,
      offset?: number,
    ) => Promise<{ skills: { id: string; skillId: string; name: string; installs: number; source: string }[]; count: number }>
    fetchTrending: () => Promise<
      {
        id: string
        skillId: string
        name: string
        installs: number
        source: string
        isOfficial?: boolean
      }[]
    >
    fetchSkillContent: (
      source: string,
      skillId: string,
    ) => Promise<string | null>
    createSkill: (data: {
      name: string
      description?: string
      content?: string
      agentNames?: string[]
    }) => Promise<{ name: string; path: string; targets: string[] }>
    removeSkill: (name: string) => Promise<void>
    updateSkill: (name: string) => Promise<void>
    readSkillContent: (path: string) => Promise<string>
    listSupportingFiles: (
      path: string,
    ) => Promise<Array<{ relativePath: string; size: number }>>
    readSupportingFile: (path: string, relativePath: string) => Promise<string>
    writeSkillContent: (filePath: string, content: string) => Promise<void>
    openInFinder: (filePath: string) => Promise<void>
    removeFromAgent: (skillName: string, agentName: string) => Promise<void>
    addToAgent: (
      skillName: string,
      canonicalPath: string,
      agentName: string,
    ) => Promise<void>

    // Remote servers
    serversList: () => Promise<RemoteServer[]>
    serversCreate: (data: {
      label: string
      host: string
      port?: number
      username: string
      skillsBasePath?: string
      sshKeyPath?: string | null
    }) => Promise<RemoteServer>
    serversUpdate: (
      id: string,
      fields: {
        label?: string
        host?: string
        port?: number
        username?: string
        skillsBasePath?: string
        sshKeyPath?: string | null
      },
    ) => Promise<RemoteServer | null>
    serversDelete: (id: string) => Promise<void>
    serversTest: (id: string) => Promise<{ ok: boolean; error?: string }>
    serversSync: (id: string) => Promise<SyncResult>
    serversSkills: (serverId: string) => Promise<RemoteSkill[]>
    serversReadSkill: (serverId: string, remotePath: string) => Promise<string>
    serversWriteSkill: (
      serverId: string,
      remotePath: string,
      content: string,
    ) => Promise<{ ok: boolean }>
    serversCount: () => Promise<number>
    serversPushPreview: (serverId: string, mirror: boolean) => Promise<{
      toAdd: PushPlanEntry[]
      toUpdate: PushPlanEntry[]
      toDelete: PushPlanEntry[]
      unchanged: PushPlanEntry[]
      mirror: boolean
    }>
    serversPushApply: (
      serverId: string,
      preview: unknown,
    ) => Promise<{
      added: number
      updated: number
      deleted: number
      unchanged: number
      errors: { folderName: string; message: string }[]
    }>

    // Settings
    settingsGet: <T>(key: string, defaultValue: T) => Promise<T>
    settingsSet: (key: string, value: unknown) => Promise<void>
    settingsAll: () => Promise<Record<string, unknown>>

    // Favorites
    favoritesList: () => Promise<string[]>
    favoritesToggle: (name: string) => Promise<boolean>

    updatesGetState: () => Promise<UpdateState>
    updatesCheck: () => Promise<UpdateState>
    updatesInstall: () => Promise<void>
    appGetVersion: () => Promise<string>

    onSkillsUpdated: (
      callback: (skills: InstalledSkill[]) => void,
    ) => () => void
    onUpdateState: (callback: (state: UpdateState) => void) => () => void

    teamGetContext: (input?: {
      teamRoot?: string
      linkedProject?: string
      profile?: string
    }) => Promise<TeamResult<TeamContext>>
    teamListProfiles: (input?: {
      teamRoot?: string
      linkedProject?: string
      profile?: string
    }) => Promise<TeamResult<string[]>>
    teamGetProfileSummary: (
      profile: string,
      input?: { teamRoot?: string; linkedProject?: string; profile?: string },
    ) => Promise<TeamResult<TeamProfileSummary>>
    teamApply: (options?: {
      profile?: string
      upgrade?: boolean
      writeLock?: boolean
      dryRun?: boolean
      teamRoot?: string
      linkedProject?: string
    }) => Promise<TeamResult<TeamApplyResult>>
    teamDoctor: (options?: {
      profile?: string
      teamRoot?: string
      linkedProject?: string
    }) => Promise<TeamResult<TeamDoctorResult>>
    teamLockVerify: (options?: {
      write?: boolean
      teamRoot?: string
      linkedProject?: string
      profile?: string
    }) => Promise<TeamResult<TeamLockVerifyResult>>
    teamCatalogDrift: (options?: {
      force?: boolean
      teamRoot?: string
      linkedProject?: string
      profile?: string
    }) => Promise<TeamResult<TeamCatalogDriftResult>>
    teamGetDriftState: () => Promise<TeamDriftState | null>
    teamGetLastApplyState: () => Promise<TeamResult<TeamLastApplyState | null>>
    teamSetLastProfile: (profile: string) => Promise<void>
    onTeamDriftState: (callback: (state: TeamDriftState) => void) => () => void
  }

  interface Window {
    electronAPI: ElectronAPI
  }
}
