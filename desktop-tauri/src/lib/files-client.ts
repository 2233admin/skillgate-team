import {
  createRequestMeta,
  type AppAPI,
  type AppResult,
  type DeleteFileOutput,
  type FileStat,
  type FileTreeEntry,
  type MutationReceipt,
  type PathRef,
  type WriteSkillContentOutput,
} from "./app-api"

export interface RecoverFileOutput { location: PathRef; receipt: MutationReceipt }

export interface FilesClient {
  read(location: PathRef): Promise<AppResult<string>>
  stat(location: PathRef): Promise<AppResult<FileStat>>
  listDirectory(directory: PathRef): Promise<AppResult<FileTreeEntry[]>>
  tree(directory: PathRef, depth?: number): Promise<AppResult<FileTreeEntry>>
  write(location: PathRef, content: string, expectedRevision?: string): Promise<AppResult<WriteSkillContentOutput>>
  delete(location: PathRef, expectedRevision?: string): Promise<AppResult<DeleteFileOutput>>
  recover(recoveryToken: string): Promise<AppResult<RecoverFileOutput>>
  reveal(location: PathRef): Promise<AppResult<{ value: null }>>
}

function mutationMeta() {
  return createRequestMeta(undefined, { idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}` })
}

export function createFilesClient(api: AppAPI): FilesClient {
  return {
    read: (location) => api.files.readSkillContent({ location }, createRequestMeta()),
    stat: (location) => api.files.stat({ location }, createRequestMeta()),
    listDirectory: (directory) => api.files.listDirectory({ directory }, createRequestMeta()),
    tree: (directory, depth = 1) => api.files.tree({ directory, depth }, createRequestMeta()),
    write: (location, content, expectedRevision) => api.files.writeSkillContent({ location, content, expectedRevision }, mutationMeta()),
    delete: (location, expectedRevision) => api.files.delete({ location, expectedRevision, recovery: "quarantine" }, mutationMeta()),
    recover: (recoveryToken) => api.files.recover({ recoveryToken }, mutationMeta()),
    reveal: (location) => api.files.reveal({ location }, createRequestMeta()),
  }
}
