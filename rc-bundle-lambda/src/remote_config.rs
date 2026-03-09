use std::collections::HashMap;
use std::fmt;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};

use crate::cache_cell::CacheCell;

#[derive(Debug, Serialize, Deserialize)]
pub struct RemoteConfig {
    pub rum: RumConfig,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RumConfig {
    pub session_sample_rate: Option<f64>,
    pub session_replay_sample_rate: Option<f64>,
    #[serde(flatten)]
    pub other: HashMap<String, serde_json::Value>,
}

/// A validated Datadog site (e.g. `"datadoghq.com"`).
/// Constructed via [`Site::new`], which rejects unknown sites at the boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Site(&'static str);

/// A validated Datadog client token (e.g. `"pub44a8a6e44d32ac6fcdfdeea44b840b21"`).
/// Constructed via [`ClientToken::new`], which enforces the `pub` + 32 hex chars format.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ClientToken(String);

impl ClientToken {
    pub fn new(s: String) -> anyhow::Result<Self> {
        let is_valid = s.len() == 35
            && s.starts_with("pub")
            && s[3..].bytes().all(|b| b.is_ascii_hexdigit());
        if !is_valid {
            return Err(anyhow::anyhow!(
                "invalid clientToken: expected 'pub' followed by 32 hex characters"
            ));
        }
        Ok(Self(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A remote configuration id.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RemoteConfigId(pub String);

impl RemoteConfigId {
    pub fn new(s: String) -> anyhow::Result<Self> {
        let is_uuid = s.len() == 36
            && s.char_indices().all(|(i, c)| match i {
                8 | 13 | 18 | 23 => c == '-',
                _ => c.is_ascii_hexdigit(),
            });
        if !is_uuid {
            return Err(anyhow::anyhow!("invalid remoteConfigurationId: expected a UUID"));
        }
        Ok(Self(s))
    }
}

impl fmt::Display for RemoteConfigId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

const ALLOWED_SITES: &[&'static str] = &[
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

impl Site {
    pub fn new(s: &str) -> anyhow::Result<Self> {
        ALLOWED_SITES
            .iter()
            .find(|&&allowed| allowed == s)
            .map(|&allowed| Site(allowed))
            .ok_or_else(|| anyhow::anyhow!("unsupported site: '{s}'"))
    }
}

/// A fetched remote configuration together with its id, fetch time, and a stable content hash.
/// Two snapshots with the same `hash` are guaranteed to have identical content.
#[derive(Clone)]
pub struct RemoteConfigSnapshot {
    pub id: RemoteConfigId,
    pub url: String,
    pub config: Arc<RemoteConfig>,
    pub hash: u64,
    pub fetched_at: SystemTime,
}

const FRESH_DURATION: Duration = Duration::from_secs(60);
const STALE_DURATION: Duration = Duration::from_secs(5 * 60);

pub struct RemoteConfigService {
    cache: Mutex<
        HashMap<(Site, RemoteConfigId), Arc<CacheCell<RemoteConfigSnapshot, Arc<anyhow::Error>>>>,
    >,
}

impl RemoteConfigService {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
        }
    }

    #[tracing::instrument(skip(self))]
    pub async fn fetch(
        &self,
        site: Site,
        rc_id: RemoteConfigId,
    ) -> anyhow::Result<RemoteConfigSnapshot> {
        let cell = {
            let mut cache = self.cache.lock().unwrap();
            cache
                .entry((site, rc_id.clone()))
                .or_insert_with(|| {
                    Arc::new(CacheCell::<_, Arc<anyhow::Error>>::new(
                        "remote_config",
                        FRESH_DURATION,
                        STALE_DURATION,
                    ))
                })
                .clone()
        };

        cell.get(move || async move {
            let endpoint = build_rc_endpoint(site, &rc_id);
            let snapshot = fetch_remote_config(&endpoint, rc_id)
                .await
                .map_err(Arc::new)?;
            Ok(snapshot)
        })
        .await
        .map_err(|e| anyhow::anyhow!("{:#}", e))
    }
}

#[tracing::instrument]
async fn fetch_remote_config(
    endpoint: &str,
    id: RemoteConfigId,
) -> anyhow::Result<RemoteConfigSnapshot> {
    let bytes = reqwest::Client::new()
        .get(endpoint)
        .send()
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    let hash = hash_bytes(&bytes);
    let value: RemoteConfig = serde_json::from_slice(&bytes)?;
    Ok(RemoteConfigSnapshot {
        id,
        url: endpoint.to_string(),
        config: Arc::new(value),
        hash,
        fetched_at: SystemTime::now(),
    })
}

fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

fn build_rc_endpoint(site: Site, rc_id: &RemoteConfigId) -> String {
    let mut parts: Vec<&str> = site.0.split('.').collect();
    let tld = parts.pop().unwrap_or(site.0);
    format!(
        "https://sdk-configuration.browser-intake-{}.{}/v1/{}.json",
        parts.join("-"),
        tld,
        urlencoding::encode(&rc_id.0)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_UUID: &str = "ab46a2ae-e10f-4487-8e9a-b2f43234902e";

    fn endpoint(site: &str, rc_id: &str) -> anyhow::Result<String> {
        Ok(build_rc_endpoint(
            Site::new(site)?,
            &RemoteConfigId::new(rc_id.to_string())?,
        ))
    }

    #[test]
    fn us1() {
        assert_eq!(
            endpoint("datadoghq.com", TEST_UUID).unwrap(),
            format!("https://sdk-configuration.browser-intake-datadoghq.com/v1/{TEST_UUID}.json")
        );
    }

    #[test]
    fn eu1() {
        assert_eq!(
            endpoint("datadoghq.eu", TEST_UUID).unwrap(),
            format!("https://sdk-configuration.browser-intake-datadoghq.eu/v1/{TEST_UUID}.json")
        );
    }

    #[test]
    fn us3() {
        assert_eq!(
            endpoint("us3.datadoghq.com", TEST_UUID).unwrap(),
            format!("https://sdk-configuration.browser-intake-us3-datadoghq.com/v1/{TEST_UUID}.json")
        );
    }

    #[test]
    fn rejects_unknown_site() {
        assert!(Site::new("evil.com").is_err());
    }

    #[test]
    fn accepts_valid_client_token() {
        assert!(ClientToken::new("pub44a8a6e44d32ac6fcdfdeea44b840b21".to_string()).is_ok());
    }

    #[test]
    fn rejects_client_token_without_pub_prefix() {
        assert!(ClientToken::new("44a8a6e44d32ac6fcdfdeea44b840b21".to_string()).is_err());
    }

    #[test]
    fn rejects_client_token_with_non_hex_chars() {
        assert!(ClientToken::new("pubzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz".to_string()).is_err());
    }

    #[test]
    fn rejects_client_token_wrong_length() {
        assert!(ClientToken::new("pub44a8a6e44d32ac6".to_string()).is_err());
    }

    #[test]
    fn accepts_valid_uuid() {
        assert!(RemoteConfigId::new(TEST_UUID.to_string()).is_ok());
    }

    #[test]
    fn rejects_non_uuid() {
        assert!(RemoteConfigId::new("not-a-uuid".to_string()).is_err());
    }

    #[test]
    fn rejects_uuid_with_wrong_case_separators() {
        assert!(RemoteConfigId::new("ab46a2ae_e10f_4487_8e9a_b2f43234902e".to_string()).is_err());
    }
}
