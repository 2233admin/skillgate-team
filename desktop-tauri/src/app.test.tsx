import { describe, expect, it } from "vitest"
import { validateHostDescription } from "./app"
import type { AppDescription } from "./lib/app-api"

function host(overrides: Partial<AppDescription> = {}): AppDescription {
  return {
    contract: { major: 1, minor: 0 },
    implementation: { name: "Skillgate", version: "test", platform: "windows", arch: "x86_64" },
    capabilities: {
      "catalog.local": {
        state: "degraded",
        version: "1.0",
        operations: ["selectRoot", "scan", "list", "search", "getItem"],
      },
    } as AppDescription["capabilities"],
    ...overrides,
  }
}

describe("Skillgate host bootstrap", () => {
  it("accepts the M1 degraded catalog when every required read operation exists", () => {
    expect(validateHostDescription(host()).status).toBe("ready")
  })

  it("blocks an incompatible contract major", () => {
    expect(validateHostDescription(host({ contract: { major: 2 as 1, minor: 0 } })).status).toBe("incompatible")
  })

  it("blocks a host that omits a required catalog operation", () => {
    const value = host()
    value.capabilities["catalog.local"].operations = ["scan"]
    expect(validateHostDescription(value).status).toBe("unavailable")
  })
})
