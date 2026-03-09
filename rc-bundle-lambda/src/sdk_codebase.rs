use bytes_str::BytesStr;
use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::io::Read;
use std::sync::Arc;
use tar::Archive;
use tokio::fs;
use tokio::sync::OnceCell;

type Error = Box<dyn std::error::Error + Send + Sync>;

pub type Files = Arc<HashMap<String, BytesStr>>;

pub struct SdkCodebase {
    files: OnceCell<Files>,
}

impl SdkCodebase {
    pub fn new() -> Self {
        Self {
            files: OnceCell::new(),
        }
    }

    pub async fn files(&self) -> Result<Files, Error> {
        self.files
            .get_or_try_init(async || {
                let bytes = fetch_tarball_bytes().await?;
                extract_tarball(bytes).await.map(Arc::new)
            })
            .await
            .cloned()
    }
}

async fn fetch_tarball_bytes() -> Result<Vec<u8>, Error> {
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

async fn fetch_tarball_from_github() -> Result<Vec<u8>, Error> {
    let t = std::time::Instant::now();
    let bytes = reqwest::Client::new()
        .get("https://api.github.com/repos/DataDog/browser-sdk/tarball/main")
        .header("User-Agent", "rc-bundle-lambda")
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?
        .to_vec();
    tracing::info!(
        bytes = bytes.len(),
        elapsed_ms = t.elapsed().as_millis(),
        "fetched tarball from GitHub"
    );
    Ok(bytes)
}

async fn extract_tarball(bytes: Vec<u8>) -> Result<HashMap<String, BytesStr>, Error> {
    tokio::task::spawn_blocking(move || {
        let t = std::time::Instant::now();
        let mut files = HashMap::new();
        let mut archive = Archive::new(GzDecoder::new(bytes.as_slice()));

        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?.to_string_lossy().into_owned();

            // strip the top-level "DataDog-browser-sdk-{sha}/" directory
            let path = path.splitn(2, '/').nth(1).unwrap_or(&path).to_string();

            if !path.is_empty() {
                let mut content = Vec::new();
                entry.read_to_end(&mut content)?;
                // skip non-UTF-8 files (e.g. binary assets) — we only need source files
                if let Ok(s) = BytesStr::from_utf8_vec(content) {
                    files.insert(path, s);
                }
            }
        }

        tracing::info!(
            files = files.len(),
            elapsed_ms = t.elapsed().as_millis(),
            "extracted tarball"
        );
        Ok(files)
    })
    .await?
}
