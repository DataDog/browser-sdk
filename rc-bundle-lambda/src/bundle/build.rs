use std::collections::HashMap;
use std::hash::BuildHasherDefault;
use std::sync::Arc;
use std::time::SystemTime;

use anyhow::anyhow;
use arcstr::ArcStr;
use chrono::{DateTime, Utc};
use indexmap::IndexMap;
use relative_path::RelativePath;
use rolldown::{
    Bundler, BundlerOptions, InnerOptions, InputItem, ModuleSideEffects, OutputFormat,
    RawMinifyOptions, TreeshakeOptions,
    plugin::{
        HookLoadArgs, HookLoadOutput, HookLoadReturn, HookResolveIdArgs, HookResolveIdOutput,
        HookResolveIdReturn, HookUsage, Plugin, PluginContext, SharedLoadPluginContext,
    },
};
use rolldown_common::Output;
use rustc_hash::FxHasher;

use crate::remote_config::{ClientToken, RemoteConfigSnapshot, Site};
use crate::sdk_codebase::{Files, FilesSnapshot};

type FxIndexMap<K, V> = IndexMap<K, V, BuildHasherDefault<FxHasher>>;

const SDK_VERSION: &str = "1.0.0";

const VIRTUAL_ENTRY_PATH: &str = "__entry__.ts";

const DEFLATE_WORKER_PATH: &str = "packages/rum/src/domain/deflate/deflateWorker.ts";
const STUB_DEFLATE_WORKER: &str = "export function startDeflateWorker() {}";

const RECORDER_API_PATH: &str = "packages/rum/src/boot/recorderApi.ts";
const STUB_RECORDER_API: &str = "\
export function makeRecorderApi() {
  return {
    start() {},
    stop() {},
    getReplayStats() {},
    onRumStart() {},
    isRecording() { return false },
    getSessionReplayLink() {}
  }
}
";

pub async fn bundle_sdk(
    files: FilesSnapshot,
    rc: RemoteConfigSnapshot,
    client_token: ClientToken,
    site: Site,
    minify: bool,
) -> anyhow::Result<String> {
    let t = std::time::Instant::now();

    let worker_string = build_worker_string(&files, minify).await?;

    let mut base_map = (*files.files).clone();
    base_map.insert(
        VIRTUAL_ENTRY_PATH.to_string(),
        ArcStr::from(render_virtual_entry(&rc, &client_token, site)),
    );
    let file_map = apply_rc_overrides(Arc::new(base_map), &rc);
    let js = build_js(
        file_map,
        VIRTUAL_ENTRY_PATH,
        &[
            ("__BUILD_ENV__SDK_VERSION__", SDK_VERSION),
            ("__BUILD_ENV__WORKER_STRING__", &worker_string),
            ("__BUILD_ENV__SDK_SETUP__", "rc-bundle"),
        ],
        minify,
    )
    .await?;

    let buf = render_bundle(&rc, &files, &js);

    tracing::info!(
        bytes = buf.len(),
        elapsed_ms = t.elapsed().as_millis(),
        "bundled SDK"
    );
    Ok(buf)
}

async fn build_worker_string(files: &FilesSnapshot, minify: bool) -> anyhow::Result<String> {
    build_js(
        files.files.clone(),
        "@datadog/browser-worker",
        &[
            ("__BUILD_ENV__SDK_VERSION__", SDK_VERSION),
            ("__BUILD_ENV__SDK_SETUP__", "rc-bundle"),
        ],
        minify,
    )
    .await
}

async fn build_js(
    files: Files,
    entry: &str,
    defines: &[(&str, &str)],
    do_minify: bool,
) -> anyhow::Result<String> {
    let define: FxIndexMap<String, String> = defines
        .iter()
        .map(|(k, v)| (k.to_string(), js_string_literal(v)))
        .collect();

    let packages = build_package_map(&files);
    let plugin = Arc::new(MemoryPlugin { files, packages });

    let mut bundler = Bundler::with_plugins(
        BundlerOptions {
            input: Some(vec![InputItem {
                name: None,
                import: entry.to_string(),
            }]),
            format: Some(OutputFormat::Iife),
            define: if define.is_empty() {
                None
            } else {
                Some(define)
            },
            minify: Some(if do_minify {
                RawMinifyOptions::Bool(true)
            } else {
                RawMinifyOptions::DeadCodeEliminationOnly
            }),
            treeshake: TreeshakeOptions::Option(InnerOptions {
                module_side_effects: ModuleSideEffects::Boolean(false),
                ..Default::default()
            }),
            ..Default::default()
        },
        vec![plugin],
    )?;

    let output = bundler.generate().await.map_err(|errs| {
        let messages: Vec<String> = errs.iter().map(|e| e.to_string()).collect();
        anyhow!("rolldown build failed:\n{}", messages.join("\n"))
    })?;

    for chunk in output.assets {
        if let Output::Chunk(chunk) = chunk {
            return Ok(Arc::try_unwrap(chunk).unwrap().code);
        }
    }
    Err(anyhow!("rolldown build did not return a chunk"))
}

fn apply_rc_overrides(files: Files, rc: &RemoteConfigSnapshot) -> Files {
    let rum = &rc.config.rum;
    let mut overrides: Vec<(String, ArcStr)> = Vec::new();

    if rum.session_sample_rate.unwrap_or(100.0) == 0.0 {
        overrides.push((VIRTUAL_ENTRY_PATH.to_string(), ArcStr::from("")));
    }
    if rum.session_replay_sample_rate.unwrap_or(0.0) == 0.0 {
        overrides.push((
            RECORDER_API_PATH.to_string(),
            ArcStr::from(STUB_RECORDER_API),
        ));
        overrides.push((
            DEFLATE_WORKER_PATH.to_string(),
            ArcStr::from(STUB_DEFLATE_WORKER),
        ));
    }

    if overrides.is_empty() {
        files
    } else {
        let mut map = (*files).clone();
        map.extend(overrides);
        Arc::new(map)
    }
}

fn render_virtual_entry(
    rc: &RemoteConfigSnapshot,
    client_token: &ClientToken,
    site: Site,
) -> String {
    let rum_json = serde_json::to_string(&rc.config.rum).expect("RumConfig serialization failed");
    format!(
        "
import {{ datadogRum }} from '@datadog/browser-rum';
datadogRum._setDebug(true)
datadogRum.init({{
    clientToken: '{}',
    applicationId: 'xxx',
    site: '{}',
    remoteConfiguration: {rum_json}
}});
",
        client_token.as_str(),
        site.as_str()
    )
}

fn render_bundle(rc: &RemoteConfigSnapshot, files: &FilesSnapshot, js: &str) -> String {
    let rc_url = &rc.url;
    let rc_fetched_at = format_time(rc.fetched_at);
    let codebase_commit = &files.commit;
    let codebase_fetched_at = format_time(files.fetched_at);

    format!(
        "\
// RC: {rc_url}, fetched at {rc_fetched_at}
// Codebase: commit {codebase_commit}, fetched at {codebase_fetched_at}
{js}
",
    )
}

fn format_time(t: SystemTime) -> String {
    DateTime::<Utc>::from(t)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

fn js_string_literal(s: &str) -> String {
    serde_json::to_string(s).expect("string serialization always succeeds")
}

#[derive(Debug)]
struct MemoryPlugin {
    files: Files,
    packages: HashMap<String, String>,
}

impl Plugin for MemoryPlugin {
    fn name(&self) -> std::borrow::Cow<'static, str> {
        "memory".into()
    }

    fn register_hook_usage(&self) -> HookUsage {
        HookUsage::ResolveId | HookUsage::Load
    }

    fn resolve_id(
        &self,
        _ctx: &PluginContext,
        args: &HookResolveIdArgs<'_>,
    ) -> impl std::future::Future<Output = HookResolveIdReturn> + Send {
        let resolved = {
            let specifier = args.specifier;
            if specifier.starts_with('.') {
                let base = args.importer.unwrap_or("");
                let path = RelativePath::new(base)
                    .parent()
                    .unwrap_or(RelativePath::new(""))
                    .join_normalized(specifier);
                try_resolve(&self.files, path.as_str())
            } else if let Some(pkg_path) = self.packages.get(specifier) {
                try_resolve(&self.files, pkg_path)
            } else {
                try_resolve(&self.files, specifier)
            }
        };
        let id = resolved.map(HookResolveIdOutput::from_id);
        async move { Ok(id) }
    }

    fn load(
        &self,
        _ctx: SharedLoadPluginContext,
        args: &HookLoadArgs<'_>,
    ) -> impl std::future::Future<Output = HookLoadReturn> + Send {
        let output = self.files.get(args.id).map(|code| HookLoadOutput {
            code: code.clone(),
            ..Default::default()
        });
        async move { Ok(output) }
    }
}

const TSCONFIG_PATH: &str = "tsconfig.base.json";

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TsConfig {
    compiler_options: TsCompilerOptions,
}

#[derive(serde::Deserialize)]
struct TsCompilerOptions {
    #[serde(default)]
    paths: HashMap<String, Vec<String>>,
}

fn build_package_map(files: &Files) -> HashMap<String, String> {
    let Some(content) = files.get(TSCONFIG_PATH) else {
        return HashMap::new();
    };
    let Ok(tsconfig) = serde_json::from_str::<TsConfig>(content.as_str()) else {
        return HashMap::new();
    };

    tsconfig
        .compiler_options
        .paths
        .into_iter()
        .filter_map(|(name, entries)| {
            let path = entries.into_iter().next()?;
            let path = path.strip_prefix("./").unwrap_or(&path).to_string();
            Some((name, path))
        })
        .collect()
}

fn try_resolve<'a>(files: &'a Files, path: &str) -> Option<&'a str> {
    if let Some((key, _)) = files.get_key_value(path) {
        return Some(key);
    }
    let mut candidate = String::with_capacity(path.len() + 10);
    candidate.push_str(path);
    let base_len = candidate.len();
    for suffix in [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        "/index.ts",
        "/index.tsx",
        "/index.js",
        "/index.jsx",
    ] {
        candidate.truncate(base_len);
        candidate.push_str(suffix);
        if let Some((key, _)) = files.get_key_value(candidate.as_str()) {
            return Some(key);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::SystemTime;

    use super::*;
    use crate::remote_config::{
        ClientToken, RemoteConfig, RemoteConfigId, RemoteConfigSnapshot, RumConfig, Site,
    };

    const TEST_TOKEN: &str = "pub44a8a6e44d32ac6fcdfdeea44b840b21";

    fn make_client_token() -> ClientToken {
        ClientToken::new(TEST_TOKEN.to_string()).unwrap()
    }

    fn make_site() -> Site {
        Site::new("datadoghq.com").unwrap()
    }

    fn make_rc(session_sample_rate: Option<f64>) -> RemoteConfigSnapshot {
        make_rc_full(session_sample_rate, None)
    }

    fn make_rc_full(
        session_sample_rate: Option<f64>,
        session_replay_sample_rate: Option<f64>,
    ) -> RemoteConfigSnapshot {
        RemoteConfigSnapshot {
            id: RemoteConfigId::new("00000000-0000-0000-0000-000000000000".to_string()).unwrap(),
            url: "https://example.com/rc.json".to_string(),
            config: Arc::new(RemoteConfig {
                rum: RumConfig {
                    session_sample_rate,
                    session_replay_sample_rate,
                    other: Default::default(),
                },
            }),
            hash: 0,
            fetched_at: SystemTime::UNIX_EPOCH,
        }
    }

    fn make_snapshot(entries: &[(&str, &str)]) -> FilesSnapshot {
        FilesSnapshot {
            files: make_files(entries),
            hash: 0,
            fetched_at: SystemTime::UNIX_EPOCH,
            commit: "abc1234".to_string(),
        }
    }

    fn make_snapshot_with_rum(
        session_sample_rate: Option<f64>,
    ) -> (FilesSnapshot, RemoteConfigSnapshot) {
        let files = make_snapshot(&[
            (
                TSCONFIG_PATH,
                &tsconfig(r#""@datadog/browser-rum": ["./packages/rum/src/entries/main"]"#),
            ),
            (
                "packages/rum/src/entries/main.ts",
                "export const datadogRum = { init: function() {} };",
            ),
        ]);
        let rc = make_rc(session_sample_rate);
        (files, rc)
    }

    #[tokio::test]
    async fn outputs_empty_bundle_when_session_sample_rate_is_zero() {
        let files = make_snapshot(&[]);
        let rc = make_rc(Some(0.0));
        let result = bundle_sdk(files, rc, make_client_token(), make_site(), true)
            .await
            .unwrap();
        assert!(result.starts_with("// RC:"));
        // Empty entry: no SDK initialization code
        assert!(!result.contains("datadogRum.init"));
    }

    #[tokio::test]
    async fn outputs_js_when_session_sample_rate_is_nonzero() {
        let (files, rc) = make_snapshot_with_rum(Some(100.0));
        let result = bundle_sdk(files, rc, make_client_token(), make_site(), true)
            .await
            .unwrap();
        assert!(result.lines().count() > 2);
    }

    #[tokio::test]
    async fn outputs_js_when_session_sample_rate_is_absent() {
        let (files, rc) = make_snapshot_with_rum(None);
        let result = bundle_sdk(files, rc, make_client_token(), make_site(), true)
            .await
            .unwrap();
        assert!(result.lines().count() > 2);
    }

    #[test]
    fn stubs_entry_when_session_sample_rate_is_zero() {
        let files = make_files(&[]);
        let rc = make_rc_full(Some(0.0), Some(20.0));
        let result = apply_rc_overrides(files, &rc);
        assert_eq!(result.get(VIRTUAL_ENTRY_PATH).map(|s| s.as_str()), Some(""));
    }

    #[test]
    fn stubs_recorder_api_when_session_replay_sample_rate_is_zero() {
        let original = "// original recorder api";
        let files = make_files(&[(RECORDER_API_PATH, original)]);
        let rc = make_rc_full(Some(100.0), Some(0.0));
        let result = apply_rc_overrides(files, &rc);
        assert_ne!(
            result.get(RECORDER_API_PATH).map(|s| s.as_str()),
            Some(original)
        );
        assert_eq!(
            result.get(RECORDER_API_PATH).map(|s| s.as_str()),
            Some(STUB_RECORDER_API)
        );
    }

    #[test]
    fn stubs_recorder_api_when_session_replay_sample_rate_is_absent() {
        let original = "// original recorder api";
        let files = make_files(&[(RECORDER_API_PATH, original)]);
        let rc = make_rc_full(Some(100.0), None);
        let result = apply_rc_overrides(files, &rc);
        assert_eq!(
            result.get(RECORDER_API_PATH).map(|s| s.as_str()),
            Some(STUB_RECORDER_API)
        );
    }

    #[test]
    fn preserves_recorder_api_when_session_replay_sample_rate_is_nonzero() {
        let original = "// original recorder api";
        let files = make_files(&[(RECORDER_API_PATH, original)]);
        let rc = make_rc_full(Some(100.0), Some(20.0));
        let result = apply_rc_overrides(files, &rc);
        assert_eq!(
            result.get(RECORDER_API_PATH).map(|s| s.as_str()),
            Some(original)
        );
    }

    fn make_files(entries: &[(&str, &str)]) -> Files {
        std::sync::Arc::new(
            entries
                .iter()
                .map(|(k, v)| (k.to_string(), ArcStr::from(*v)))
                .collect(),
        )
    }

    fn tsconfig(paths: &str) -> String {
        format!(r#"{{"compilerOptions":{{"paths":{{{paths}}}}}}}"#)
    }

    #[test]
    fn stores_package_path_from_tsconfig() {
        let files = make_files(&[(
            TSCONFIG_PATH,
            &tsconfig(r#""@datadog/browser-rum": ["./packages/rum/src/entries/main"]"#),
        )]);
        let map = build_package_map(&files);
        assert_eq!(
            map.get("@datadog/browser-rum").map(String::as_str),
            Some("packages/rum/src/entries/main")
        );
    }

    #[test]
    fn returns_empty_when_tsconfig_is_missing() {
        let files = make_files(&[("packages/rum/src/index.ts", "")]);
        let map = build_package_map(&files);
        assert!(map.is_empty());
    }

    #[test]
    fn returns_empty_when_tsconfig_is_invalid_json() {
        let files = make_files(&[(TSCONFIG_PATH, "not json")]);
        let map = build_package_map(&files);
        assert!(map.is_empty());
    }
}
