use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::OnceCell;

type Error = Box<dyn std::error::Error + Send + Sync>;

pub type RemoteConfig = Arc<serde_json::Value>;

const ALLOWED_SITES: &[&str] = &[
    "datadoghq.com",
    "us3.datadoghq.com",
    "us5.datadoghq.com",
    "datadoghq.eu",
    "ddog-gov.com",
    "ap1.datadoghq.com",
    "ap2.datadoghq.com",
    // staging
    "datad0g.com",
    "dd0g-gov.com",
];

pub struct RemoteConfigService {
    cache: Mutex<HashMap<(String, String), Arc<OnceCell<RemoteConfig>>>>,
}

impl RemoteConfigService {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub async fn fetch(&self, site: &str, rc_id: &str) -> Result<RemoteConfig, Error> {
        let cell = {
            let mut cache = self.cache.lock().unwrap();
            cache
                .entry((site.to_string(), rc_id.to_string()))
                .or_insert_with(|| Arc::new(OnceCell::new()))
                .clone()
        };

        cell.get_or_try_init(|| async {
            let endpoint = build_rc_endpoint(site, rc_id)?;
            fetch_remote_config(&endpoint).await
        })
        .await
        .cloned()
    }
}

async fn fetch_remote_config(endpoint: &str) -> Result<RemoteConfig, Error> {
    tracing::info!(endpoint, "fetching remote config");
    let response = reqwest::Client::new()
        .get(endpoint)
        .send()
        .await?
        .error_for_status()?;
    let value: serde_json::Value = response.json().await?;
    tracing::info!("fetched remote config");
    Ok(Arc::new(value))
}

pub fn build_rc_endpoint(site: &str, rc_id: &str) -> Result<String, String> {
    if !ALLOWED_SITES.contains(&site) {
        return Err(format!("unsupported site: '{site}'"));
    }
    let mut parts: Vec<&str> = site.split('.').collect();
    let tld = parts.pop().unwrap_or(site);
    let host = format!("browser-intake-{}.{}", parts.join("-"), tld);
    Ok(format!(
        "https://sdk-configuration.{}/v1/{}.json",
        host,
        urlencoding::encode(rc_id)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn us1() {
        assert_eq!(
            build_rc_endpoint("datadoghq.com", "my-rc-id").unwrap(),
            "https://sdk-configuration.browser-intake-datadoghq.com/v1/my-rc-id.json"
        );
    }

    #[test]
    fn eu1() {
        assert_eq!(
            build_rc_endpoint("datadoghq.eu", "my-rc-id").unwrap(),
            "https://sdk-configuration.browser-intake-datadoghq.eu/v1/my-rc-id.json"
        );
    }

    #[test]
    fn us3() {
        assert_eq!(
            build_rc_endpoint("us3.datadoghq.com", "my-rc-id").unwrap(),
            "https://sdk-configuration.browser-intake-us3-datadoghq.com/v1/my-rc-id.json"
        );
    }

    #[test]
    fn rejects_unknown_site() {
        assert!(build_rc_endpoint("evil.com", "my-rc-id").is_err());
    }

    #[test]
    fn encodes_rc_id() {
        assert_eq!(
            build_rc_endpoint("datadoghq.com", "my rc/id").unwrap(),
            "https://sdk-configuration.browser-intake-datadoghq.com/v1/my%20rc%2Fid.json"
        );
    }
}
