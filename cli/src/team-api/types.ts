import type { AgentType, InstallMethod } from "../types.js";

export type TeamErrorCode =
  | "TEAM_ROOT_MISSING"
  | "PROFILE_NOT_FOUND"
  | "NO_AGENTS"
  | "APPLY_PARTIAL_FAIL"
  | "LOCK_MISMATCH"
  | "NETWORK_TIMEOUT"
  | "UNKNOWN";

export interface TeamError {
  code: TeamErrorCode;
  message: string;
  details?: unknown;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: TeamError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(
  code: TeamErrorCode,
  message: string,
  details?: unknown,
): Result<never> {
  return { ok: false, error: { code, message, details } };
}

export type ProfileSource =
  | "explicit"
  | "linked_project"
  | "settings"
  | "cwd"
  | "default";

export interface TeamSettings {
  "team.root"?: string;
  "team.linkedProject"?: string;
  "team.lastProfile"?: string;
}

export interface TeamContext {
  teamRoot: string;
  linkedProject?: string;
  effectiveProfile: string;
  profileSource: ProfileSource;
}

export interface ResolveTeamContextInput {
  teamRoot?: string;
  linkedProject?: string;
  profile?: string;
  settings?: TeamSettings;
  /** CLI compat: read `.skillgate/profile` from this directory when no explicit profile. */
  cwd?: string;
}

export interface ProfileSummary {
  name: string;
  description?: string;
  skillCount: number;
  agents?: AgentType[];
}

export type DriftKind =
  | "missing"
  | "hash_mismatch"
  | "lock_missing"
  | "source_missing";

export interface DriftItem {
  skill: string;
  kind: DriftKind;
  expected?: string;
  actual?: string;
  path?: string;
  agent?: string;
}

export interface DoctorResult {
  ok: boolean;
  profile: string;
  drifts: DriftItem[];
  agentCount: number;
  teamRoot: string;
}

export interface DoctorOptions {
  profile?: string;
}

export interface LockMismatch {
  skill: string;
  lockHash: string | null;
  diskHash: string;
}

export interface LockVerifyResult {
  ok: boolean;
  mismatches: LockMismatch[];
  mismatchCount: number;
  updated: boolean;
}

export interface LockVerifyOptions {
  write?: boolean;
}

export type CatalogDriftStatus = "ok" | "behind" | "unknown";

export interface CatalogDriftResult {
  status: CatalogDriftStatus;
  fromCache: boolean;
  localVersion?: string;
  remoteVersion?: string;
  message?: string;
}

export interface CatalogDriftOptions {
  force?: boolean;
  /** Override state directory (for tests). */
  stateDir?: string;
  /** Inject current time in seconds (for tests). */
  nowSec?: number;
}

export interface ApplySkillResult {
  skill: string;
  agent: string;
  success: boolean;
  error?: string;
}

export interface ApplyResult {
  profile: string;
  installed: number;
  failed: number;
  skipped: string[];
  method: InstallMethod;
  agents: string[];
  results: ApplySkillResult[];
  lockUpdated: boolean;
}

export interface ApplyOptions {
  profile?: string;
  upgrade?: boolean;
  method?: InstallMethod;
  agents?: string[];
  writeLock?: boolean;
  dryRun?: boolean;
}

export interface LastApplyState {
  appliedAt: string;
  profile: string;
  revision: number;
  teamRoot: string;
  method: InstallMethod;
  agents: string[];
}