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
pub use grant::{AuthorizedPath, GrantRegistry};
pub use model::{
    CatalogFilter, CatalogGroup, CatalogInstallationLevel, CatalogItem, CatalogKind,
    CatalogPlatform, CatalogRiskLevel, CatalogRiskSignal, CatalogScope, CatalogSkillMetadata,
    CatalogSnapshot, CatalogSourceKind, CatalogSummary, CatalogUsageStatus, ListCatalogInput,
    ListCatalogOutput, PathRef, RootGrant,
};
pub use scanner::is_noise_directory;
pub use service::CatalogService;
