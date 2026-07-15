import { describe, expect, it, vi } from "vitest"
import type {
  AppEvent,
  AppResult,
  EventKind,
  EventListener,
  EventPayloadMap,
  RequestMeta,
  SubscribeInput,
  Subscription,
} from "../lib/app-api"
import { TerminalController, type TerminalClient } from "./terminal-controller"

function ok<T>(data: T): AppResult<T> {
  return { ok: true, data, meta: { requestId: "r", correlationId: "c", completedAt: "now" } }
}

describe("TerminalController", () => {
  it("subscribes before create, preserves output order, and treats exit as final", async () => {
    const listeners = new Map<EventKind, EventListener<EventKind>>()
    const create = vi.fn(async () => ok({ terminalId: "pty-1", pid: 42, startedAt: "now" }))
    const api = {
      terminals: {
        create,
        write: vi.fn(async () => ok({ value: null })),
        resize: vi.fn(async () => ok({ value: null })),
        close: vi.fn(async () => ok({ operation: "close", idempotencyKey: "k", committed: true, completedAt: "now" })),
      },
      events: {
        subscribe: vi.fn(async <K extends EventKind>(
          input: SubscribeInput<K>,
          listener: EventListener<K>,
          _meta: RequestMeta,
        ): Promise<AppResult<Subscription<K>>> => {
          listeners.set(input.kind, listener as EventListener<EventKind>)
          return ok({ subscriptionId: `sub-${input.kind}` })
        }),
        unsubscribe: vi.fn(async () => ok({ value: null })),
      },
    } as TerminalClient
    const controller = new TerminalController(api)

    expect((await controller.start("prepared-1", "Reviewer")).ok).toBe(true)
    expect([...listeners.keys()]).toEqual(["terminal.output", "terminal.exit"])
    expect(create).toHaveBeenCalledOnce()

    listeners.get("terminal.output")?.({
      kind: "terminal.output",
      stream: "terminal",
      subscriptionId: "sub-terminal.output",
      sequence: 1,
      emittedAt: "now",
      payload: { terminalId: "pty-1", data: "one" },
    } as AppEvent<EventPayloadMap["terminal.output"]>)
    listeners.get("terminal.output")?.({
      kind: "terminal.output",
      stream: "terminal",
      subscriptionId: "sub-terminal.output",
      sequence: 1,
      emittedAt: "now",
      payload: { terminalId: "pty-1", data: "duplicate" },
    } as AppEvent<EventPayloadMap["terminal.output"]>)
    listeners.get("terminal.output")?.({
      kind: "terminal.output",
      stream: "terminal",
      subscriptionId: "sub-terminal.output",
      sequence: 2,
      emittedAt: "now",
      payload: { terminalId: "pty-1", data: " two" },
    } as AppEvent<EventPayloadMap["terminal.output"]>)
    listeners.get("terminal.exit")?.({
      kind: "terminal.exit",
      stream: "terminal",
      subscriptionId: "sub-terminal.exit",
      sequence: 1,
      emittedAt: "now",
      payload: { terminalId: "pty-1", exitCode: 0 },
    } as AppEvent<EventPayloadMap["terminal.exit"]>)

    expect(controller.getSnapshot()[0]).toMatchObject({
      output: "one two",
      status: "exited",
      exitCode: 0,
    })
  })

  it("uses idempotent close and unsubscribes both event streams", async () => {
    const close = vi.fn(async () => ok({ operation: "close", idempotencyKey: "k", committed: true, completedAt: "now" }))
    const unsubscribe = vi.fn(async () => ok({ value: null }))
    const api = {
      terminals: {
        create: vi.fn(async () => ok({ terminalId: "pty-1", pid: 42, startedAt: "now" })),
        write: vi.fn(async () => ok({ value: null })),
        resize: vi.fn(async () => ok({ value: null })),
        close,
      },
      events: {
        subscribe: vi.fn(async (input: { kind: EventKind }) => ok({ subscriptionId: `sub-${input.kind}` })),
        unsubscribe,
      },
    } as unknown as TerminalClient
    const controller = new TerminalController(api)
    await controller.start("prepared-1", "Reviewer")
    await controller.close("pty-1")
    expect(close).toHaveBeenCalledWith(
      { terminalId: "pty-1" },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    )
    await controller.dispose()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })
})
