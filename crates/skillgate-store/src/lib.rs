mod error;
mod lock;
mod migrations;
mod paths;
mod repositories;
mod store;

pub use error::{Result, StoreError};
pub use lock::WriterMetadata;
pub use paths::StorePaths;
pub use repositories::{
    FavoriteToggle, FavoritesRepository, PreferencesRepository, RemoteServer, RemotesRepository,
};
pub use store::{MigrationReceipt, Store};

pub const CURRENT_SCHEMA_VERSION: i64 = 5;
