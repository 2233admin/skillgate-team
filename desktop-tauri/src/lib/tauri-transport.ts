import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import type { AppEvent, AppResult, AppTransport, EventKind, EventListener, RequestMeta } from "./app-api"

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
  const listeners = new Map<string, EventListener<EventKind>>()
  let listening = false
  const ensureEventBridge = () => {
    if (listening) return
    listening = true
    void listen<AppEvent<unknown>>("skillgate://app-event", ({ payload }) => {
      listeners.get(payload.subscriptionId)?.(payload as AppEvent<never>)
    }).catch(() => { listening = false })
  }
  return {
    async invoke<T>(command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>> {
      try {
        return await invokeHost<AppResult<T>>(command, payload as Record<string, unknown>)
      } catch {
        return unavailable(command, payload.meta)
      }
    },
    bindEvent(subscriptionId, listener) {
      listeners.set(subscriptionId, listener as EventListener<EventKind>)
      ensureEventBridge()
    },
  }
}

export const tauriTransport = createTauriTransport(invoke)
