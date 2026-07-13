import { invoke } from "@tauri-apps/api/core"
import type { AppResult, AppTransport, RequestMeta } from "./app-api"

type InvokeHost = <T>(command: string, payload: Record<string, unknown>) => Promise<T>

function unavailable<T>(command: string, meta: RequestMeta): AppResult<T> {
  const now = new Date().toISOString()
  return {
    ok: false,
    error: {
      code: "TRANSPORT_UNAVAILABLE",
      message: `Skillgate host command ${command} is unavailable`,
      category: "unavailable",
      retryable: true,
      details: { command },
    },
    meta: { requestId: meta.requestId, correlationId: meta.correlationId, completedAt: now },
  }
}

export function createTauriTransport(invokeHost: InvokeHost): AppTransport {
  return {
    async invoke<T>(command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>> {
      try {
        return await invokeHost<AppResult<T>>(command, payload as Record<string, unknown>)
      } catch {
        return unavailable(command, payload.meta)
      }
    },
  }
}

export const tauriTransport = createTauriTransport(invoke)
