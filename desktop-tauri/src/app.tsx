import { useEffect, useState } from "react"
import { CatalogPage } from "./catalog/catalog-page"
import { createAppAPI, type AppDescription } from "./lib/app-api"
import { createCatalogClient, type CatalogClient } from "./lib/catalog-client"
import { tauriTransport } from "./lib/tauri-transport"

const appAPI = createAppAPI(tauriTransport)
const catalogClient = createCatalogClient(appAPI)
const requiredCatalogOperations = ["selectRoot", "scan", "list", "search", "getItem"] as const

type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; client: CatalogClient }
  | { status: "incompatible"; message: string }
  | { status: "unavailable"; message: string }

export function validateHostDescription(description: AppDescription): BootstrapState {
  const major: number = description.contract.major
  if (major !== 1) {
    return { status: "incompatible", message: `AppAPI major ${major} is incompatible with renderer major 1.` }
  }
  const localCatalog = description.capabilities["catalog.local"]
  const missing = requiredCatalogOperations.filter((operation) => !localCatalog?.operations.includes(operation))
  if (!localCatalog || localCatalog.state === "unavailable" || missing.length > 0) {
    const reason = localCatalog?.reason?.message
    return { status: "unavailable", message: reason ?? `catalog.local is unavailable or missing operations: ${missing.join(", ") || "unknown"}.` }
  }
  return { status: "ready", client: catalogClient }
}

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: "loading" })

  useEffect(() => {
    let active = true
    void appAPI.describe({ requestedMajor: 1 }).then((result) => {
      if (!active) return
      if (!result.ok) {
        setBootstrap(result.error.code === "UNSUPPORTED_VERSION"
          ? { status: "incompatible", message: "The Skillgate host uses an incompatible AppAPI major version." }
          : { status: "unavailable", message: result.error.message })
        return
      }
      setBootstrap(validateHostDescription(result.data))
    })
    return () => { active = false }
  }, [])

  if (bootstrap.status === "loading") {
    return <BootstrapStateView title="Starting Skillgate…" detail="Negotiating the AppAPI v1 contract." />
  }
  if (bootstrap.status === "incompatible") {
    return <BootstrapStateView title="Incompatible Skillgate host" detail={bootstrap.message} />
  }
  if (bootstrap.status === "unavailable") {
    return <BootstrapStateView title="Local catalog unavailable" detail={bootstrap.message} />
  }
  return <CatalogPage api={bootstrap.client} />
}

function BootstrapStateView({ title, detail }: { title: string; detail: string }) {
  return <main className="catalog-shell"><section className="catalog-card state error" role="alert"><strong>{title}</strong><p>{detail}</p></section></main>
}
