import { describe, expect, it } from "vitest"
import { createAppAPI, type AppResult, type AppTransport, type RequestMeta } from "./app-api"
import { createFilesClient } from "./files-client"

describe("FilesClient", () => {
  it("keeps native paths off the wire and attaches idempotency metadata to mutations", async () => {
    const calls: Array<{ command: string; input: unknown; meta: RequestMeta }> = []
    const transport: AppTransport = {
      async invoke<T>(command: string, payload: { input: unknown; meta: RequestMeta }): Promise<AppResult<T>> {
        calls.push({ command, ...payload })
        return { ok: true, data: null as T, meta: { requestId: payload.meta.requestId, correlationId: payload.meta.correlationId, completedAt: "now" } }
      },
    }
    const files = createFilesClient(createAppAPI(transport))
    const location = { grantId: "root", relativePath: "docs/readme.md" }

    await files.read(location)
    await files.write(location, "updated", "rev-1")
    await files.delete(location, "rev-2")

    expect(calls.map((call) => call.command)).toEqual([
      "files_read_skill_content",
      "files_write_skill_content",
      "files_delete",
    ])
    expect(calls[1].meta.idempotencyKey).toEqual(expect.any(String))
    expect(calls[2].meta.idempotencyKey).toEqual(expect.any(String))
    expect(JSON.stringify(calls)).not.toMatch(/[A-Z]:\\|\/Users\//)
  })
})
