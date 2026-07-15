import {
  createRequestMeta,
  type AppAPI,
  type AppResult,
  type CatalogFilter,
  type CatalogItem,
  type CatalogSnapshot,
  type ListCatalogOutput,
  type RootGrant,
} from "./app-api"

/** Renderer-only convenience facade. These positional calls never cross the wire. */
export interface CatalogClient {
  selectRoot(source?: "home" | "picker"): Promise<AppResult<RootGrant | null>>
  scan(grantId: string, force?: boolean): Promise<AppResult<CatalogSnapshot>>
  list(grantId: string, filter?: CatalogFilter): Promise<AppResult<ListCatalogOutput>>
  search(grantId: string, filter: CatalogFilter): Promise<AppResult<ListCatalogOutput>>
  getItem(grantId: string, itemId: string): Promise<AppResult<CatalogItem>>
}

export function createCatalogClient(api: AppAPI): CatalogClient {
  return {
    selectRoot: (source = "home") => api.catalog.selectRoot({ source }, createRequestMeta()),
    scan: (grantId, force = false) => api.catalog.scan({ grantId, force }, createRequestMeta()),
    list: (grantId, filter) => api.catalog.list({ grantId, filter, offset: 0, limit: 10_000 }, createRequestMeta()),
    search: (grantId, filter) => api.catalog.search({ grantId, filter, offset: 0, limit: 10_000 }, createRequestMeta()),
    getItem: (grantId, itemId) => api.catalog.getItem({ grantId, itemId }, createRequestMeta()),
  }
}
