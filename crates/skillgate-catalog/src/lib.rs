//! Read-only local catalog core for Skillgate Desktop.
//!
//! Native paths stay inside [`GrantRegistry`]. All serializable locations are
//! grant-relative [`PathRef`] values suitable for the AppAPI v1 boundary.

mod error;
mod grant;
mod model;
mod parser;
mod scanner;
mod service;

pub use error::{AppError, AppErrorCategory, AppErrorCode, AppResult};
pub use grant::GrantRegistry;
pub use model::{
    CatalogFilter, CatalogGroup, CatalogItem, CatalogKind, CatalogPlatform, CatalogScope,
    CatalogSnapshot, CatalogSummary, ListCatalogInput, ListCatalogOutput, PathRef, RootGrant,
};
pub use service::CatalogService;
