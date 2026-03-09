use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::remote_config::{ClientToken, RemoteConfigId, RemoteConfigSnapshot};
use crate::sdk_codebase::SdkCodebase;

use super::build::bundle_sdk;

#[derive(PartialEq, Eq, Hash)]
struct BundleCacheKey {
    rc_id: RemoteConfigId,
    client_token: ClientToken,
    minify: bool,
}

pub struct BundleService {
    sdk: Arc<SdkCodebase>,
    /// Each entry stores the hashes of both inputs so we can detect when either the SDK source
    /// or the remote configuration has changed.
    cache: Mutex<HashMap<BundleCacheKey, CachedBundle>>,
}

struct CachedBundle {
    files_hash: u64,
    rc_hash: u64,
    bundle: Arc<Vec<u8>>,
}

impl BundleService {
    pub fn new(sdk: Arc<SdkCodebase>) -> Self {
        Self {
            sdk,
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub async fn build(
        &self,
        rc: RemoteConfigSnapshot,
        client_token: ClientToken,
        minify: bool,
    ) -> anyhow::Result<Arc<Vec<u8>>> {
        let files = self.sdk.files().await?;
        let cache_key = BundleCacheKey {
            rc_id: rc.id.clone(),
            client_token: client_token.clone(),
            minify,
        };

        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(&cache_key)
                && cached.files_hash == files.hash
                && cached.rc_hash == rc.hash
            {
                tracing::debug!(
                    rc_id = %rc.id,
                    files_hash = files.hash,
                    rc_hash = rc.hash,
                    minify,
                    "bundle cache hit"
                );
                return Ok(cached.bundle.clone());
            }
        }

        let files_hash = files.hash;
        let rc_hash = rc.hash;
        let rc_id = rc.id.clone();
        tracing::debug!(%rc_id, files_hash, rc_hash, minify, "bundle cache miss, rebuilding");
        let result = Arc::new(bundle_sdk(files, rc, client_token, minify).await?);

        self.cache.lock().unwrap().insert(
            cache_key,
            CachedBundle {
                files_hash,
                rc_hash,
                bundle: Arc::clone(&result),
            },
        );
        Ok(result)
    }
}
