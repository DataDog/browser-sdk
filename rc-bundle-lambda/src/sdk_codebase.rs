use arcstr::ArcStr;
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::Read;
use std::sync::Arc;
use std::time::{Duration, SystemTime};
use tar::Archive;
use tokio::fs;

use crate::cache_cell::CacheCell;

pub type Files = Arc<HashMap<String, ArcStr>>;

/// A snapshot of the SDK codebase files together with metadata extracted at fetch time.
/// Two snapshots with the same `hash` are guaranteed to have identical content.
#[derive(Clone)]
pub struct FilesSnapshot {
    pub files: Files,
    pub hash: u64,
    pub fetched_at: SystemTime,
    /// Short commit SHA extracted from the tarball directory name (e.g. `"abc1234"`).
    pub commit: String,
}

const FRESH_DURATION: Duration = Duration::from_secs(5 * 60);
const STALE_DURATION: Duration = Duration::from_secs(60 * 60);

pub struct SdkCodebase {
    cell: Arc<CacheCell<FilesSnapshot, Arc<anyhow::Error>>>,
}

impl SdkCodebase {
    pub fn new() -> Self {
        Self {
            cell: Arc::new(CacheCell::new(
                "sdk_codebase",
                FRESH_DURATION,
                STALE_DURATION,
            )),
        }
    }

    pub async fn files(&self) -> anyhow::Result<FilesSnapshot> {
        self.cell
            .clone()
            .get(|| async {
                let bytes = fetch_tarball_bytes().await.map_err(Arc::new)?;
                let hash = hash_bytes(&bytes);
                extract_tarball(bytes)
                    .await
                    .map(|(files, commit)| FilesSnapshot {
                        files: Arc::new(files),
                        hash,
                        fetched_at: SystemTime::now(),
                        commit,
                    })
                    .map_err(Arc::new)
            })
            .await
            .map_err(|e| anyhow::anyhow!("{:#}", e))
    }
}

fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

async fn fetch_tarball_bytes() -> anyhow::Result<Vec<u8>> {
    if let Ok(cache_path) = std::env::var("SDK_CACHE_PATH") {
        match fs::read(&cache_path).await {
            Ok(bytes) => {
                tracing::info!(bytes = bytes.len(), "loaded tarball from local cache");
                return Ok(bytes);
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let bytes = fetch_tarball_from_github().await?;
                fs::write(&cache_path, &bytes).await?;
                return Ok(bytes);
            }
            Err(e) => return Err(e.into()),
        }
    }

    fetch_tarball_from_github().await
}

#[tracing::instrument]
async fn fetch_tarball_from_github() -> anyhow::Result<Vec<u8>> {
    let bytes = reqwest::Client::new()
        .get("https://api.github.com/repos/DataDog/browser-sdk/tarball/benoit/remote-configuration-direct-option")
        .header("User-Agent", "rc-bundle-lambda")
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?
        .to_vec();
    tracing::info!(bytes = bytes.len(), "fetched tarball from GitHub");
    Ok(bytes)
}

async fn extract_tarball(bytes: Vec<u8>) -> anyhow::Result<(HashMap<String, ArcStr>, String)> {
    tokio::task::spawn_blocking(move || {
        let t = std::time::Instant::now();
        let mut files = HashMap::new();
        let mut commit: Option<String> = None;
        let mut archive = Archive::new(GzDecoder::new(bytes.as_slice()));

        for entry in archive.entries()? {
            let mut entry = entry?;
            let raw_path = entry.path()?.to_string_lossy().into_owned();

            // The top-level directory is "DataDog-browser-sdk-{sha}/" — extract the commit
            // SHA from the first entry we encounter, then strip the prefix for all entries.
            let mut parts = raw_path.splitn(2, '/');
            let top_dir = parts.next().unwrap_or("");
            let path = parts.next().unwrap_or("").to_string();

            if commit.is_none() {
                commit = top_dir.rfind('-').map(|i| top_dir[i + 1..].to_string());
            }

            if !path.is_empty() {
                let mut content = Vec::new();
                entry.read_to_end(&mut content)?;
                // skip non-UTF-8 files (e.g. binary assets) — we only need source files
                if let Ok(s) = String::from_utf8(content) {
                    files.insert(path, ArcStr::from(s));
                }
            }
        }

        let commit =
            commit.ok_or_else(|| anyhow::anyhow!("could not extract commit SHA from tarball"))?;
        tracing::info!(
            files = files.len(),
            commit,
            elapsed_ms = t.elapsed().as_millis(),
            "extracted tarball"
        );
        Ok((files, commit))
    })
    .await?
}
