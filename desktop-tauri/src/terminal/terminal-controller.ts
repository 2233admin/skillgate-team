import {
  createRequestMeta,
  type AppAPI,
  type AppEvent,
  type AppResult,
  type TerminalSession,
} from "../lib/app-api"

export type TerminalClient = Pick<AppAPI, "terminals" | "events">

export interface TerminalTab extends TerminalSession {
  title: string
  output: string
  status: "running" | "exited" | "error"
  exitCode: number | null
  signal?: string
  error?: string
}

type Listener = () => void

const MAX_OUTPUT_CHARS = 1_000_000

export class TerminalController {
  readonly #api: TerminalClient
  #tabs: readonly TerminalTab[] = []
  #listeners = new Set<Listener>()
  #connectPromise: Promise<AppResult<void>> | null = null
  #subscriptionIds: string[] = []
  #lastSequence = new Map<string, number>()

  constructor(api: TerminalClient) {
    this.#api = api
  }

  getSnapshot = (): readonly TerminalTab[] => this.#tabs

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async start(
    preparedLaunchId: string,
    title: string,
    columns = 120,
    rows = 36,
  ): Promise<AppResult<TerminalSession>> {
    const connected = await this.connect()
    if (!connected.ok) return connected
    const result = await this.#api.terminals.create(
      { preparedLaunchId, columns, rows },
      createRequestMeta(undefined, { idempotencyKey: crypto.randomUUID() }),
    )
    if (result.ok) {
      this.#replace([
        ...this.#tabs,
        {
          ...result.data,
          title,
          output: "",
          status: "running",
          exitCode: null,
        },
      ])
    }
    return result
  }

  async write(terminalId: string, data: string): Promise<AppResult<unknown>> {
    return this.#api.terminals.write(
      { terminalId, data },
      createRequestMeta(),
    )
  }

  async resize(terminalId: string, columns: number, rows: number): Promise<AppResult<unknown>> {
    return this.#api.terminals.resize(
      { terminalId, columns, rows },
      createRequestMeta(),
    )
  }

  async close(terminalId: string): Promise<AppResult<unknown>> {
    return this.#api.terminals.close(
      { terminalId },
      createRequestMeta(undefined, { idempotencyKey: crypto.randomUUID() }),
    )
  }

  remove(terminalId: string): void {
    this.#replace(this.#tabs.filter((tab) => tab.terminalId !== terminalId))
  }

  async dispose(): Promise<void> {
    const ids = this.#subscriptionIds.splice(0)
    this.#connectPromise = null
    this.#lastSequence.clear()
    await Promise.all(
      ids.map((subscriptionId) =>
        this.#api.events.unsubscribe({ subscriptionId }, createRequestMeta()),
      ),
    )
  }

  connect(): Promise<AppResult<void>> {
    if (this.#connectPromise) return this.#connectPromise
    this.#connectPromise = this.#connect()
    return this.#connectPromise
  }

  async #connect(): Promise<AppResult<void>> {
    const output = await this.#api.events.subscribe(
      { kind: "terminal.output" },
      (event) => this.#onOutput(event),
      createRequestMeta(),
    )
    if (!output.ok) return output
    this.#subscriptionIds.push(output.data.subscriptionId)

    const exit = await this.#api.events.subscribe(
      { kind: "terminal.exit" },
      (event) => this.#onExit(event),
      createRequestMeta(),
    )
    if (!exit.ok) {
      await this.dispose()
      return exit
    }
    this.#subscriptionIds.push(exit.data.subscriptionId)
    return {
      ok: true,
      data: undefined,
      meta: exit.meta,
    }
  }

  #acceptSequence(event: AppEvent<unknown>): boolean {
    const previous = this.#lastSequence.get(event.subscriptionId) ?? 0
    if (event.sequence <= previous) return false
    this.#lastSequence.set(event.subscriptionId, event.sequence)
    return true
  }

  #onOutput(event: AppEvent<{ terminalId: string; data: string }>): void {
    if (!this.#acceptSequence(event)) return
    this.#update(event.payload.terminalId, (tab) => {
      const output = `${tab.output}${event.payload.data}`
      return {
        ...tab,
        output: output.length > MAX_OUTPUT_CHARS
          ? `[earlier output truncated]\n${output.slice(-MAX_OUTPUT_CHARS)}`
          : output,
      }
    })
  }

  #onExit(event: AppEvent<{ terminalId: string; exitCode: number | null; signal?: string }>): void {
    if (!this.#acceptSequence(event)) return
    this.#update(event.payload.terminalId, (tab) => ({
      ...tab,
      status: "exited",
      exitCode: event.payload.exitCode,
      signal: event.payload.signal,
    }))
  }

  #update(terminalId: string, update: (tab: TerminalTab) => TerminalTab): void {
    let changed = false
    const tabs = this.#tabs.map((tab) => {
      if (tab.terminalId !== terminalId) return tab
      changed = true
      return update(tab)
    })
    if (changed) this.#replace(tabs)
  }

  #replace(tabs: readonly TerminalTab[]): void {
    this.#tabs = tabs
    for (const listener of this.#listeners) listener()
  }
}

