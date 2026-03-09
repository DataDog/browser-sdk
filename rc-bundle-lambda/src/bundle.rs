use std::collections::HashMap;

use crate::sdk_codebase::Files;
use anyhow::anyhow;
use bytes_str::BytesStr;
use relative_path::RelativePath;
use swc_bundler::{Bundle, Bundler, Config, Hook, Load, ModuleData, ModuleRecord, Resolve};
use swc_common::{FileName, GLOBALS, Globals, Mark, SourceMap, Span, sync::Lrc};
use swc_ecma_ast::{EsVersion, KeyValueProp, Pass, Program};
use swc_ecma_codegen::{Config as CodegenConfig, Emitter, text_writer::JsWriter};
use swc_ecma_loader::resolve::Resolution;
use swc_ecma_parser::{Syntax, TsSyntax, parse_file_as_module};
use swc_ecma_transforms_base::resolver as make_resolver;
use swc_ecma_transforms_typescript::typescript::strip;
use swc_ecma_visit::VisitMutWith;

pub fn bundle_sdk(files: Files, entry: &str) -> anyhow::Result<Vec<u8>> {
    let t = std::time::Instant::now();
    let globals = Globals::default();
    let cm: Lrc<SourceMap> = Default::default();

    let loader = MemoryLoader {
        cm: cm.clone(),
        files: files.clone(),
    };
    let resolver = MemoryResolver::new(files);

    let mut entries = HashMap::new();
    entries.insert("entry".to_string(), FileName::Custom(entry.to_string()));

    let bundles: Vec<Bundle> = GLOBALS.set(&globals, || {
        let mut bundler = Bundler::new(
            &globals,
            cm.clone(),
            loader,
            resolver,
            Config {
                module: swc_bundler::ModuleType::Es,
                ..Default::default()
            },
            Box::new(NoopHook),
        );
        bundler.bundle(entries)
    })?;

    let bundle = bundles
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("no bundle produced"))?;
    let module = bundle.module;

    let mut buf = Vec::new();
    {
        let mut emitter = Emitter {
            cfg: CodegenConfig::default(),
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm, "\n", &mut buf, None),
        };
        emitter.emit_module(&module)?;
    }

    tracing::info!(
        bytes = buf.len(),
        elapsed_ms = t.elapsed().as_millis(),
        "bundled SDK"
    );
    Ok(buf)
}

struct MemoryLoader {
    cm: Lrc<SourceMap>,
    files: Files,
}

impl Load for MemoryLoader {
    fn load(&self, file: &FileName) -> anyhow::Result<ModuleData> {
        let path = match file {
            FileName::Custom(s) => s.clone(),
            other => return Err(anyhow!("unsupported filename: {:?}", other)),
        };

        let source: &BytesStr = self
            .files
            .get(&path)
            .ok_or_else(|| anyhow!("file not found in memory: {}", path))?;

        let fm = self
            .cm
            .new_source_file(Lrc::new(file.clone()), source.clone());

        let module = parse_file_as_module(
            &fm,
            Syntax::Typescript(TsSyntax {
                tsx: path.ends_with(".tsx"),
                ..Default::default()
            }),
            EsVersion::Es2022,
            None,
            &mut Vec::new(),
        )
        .map_err(|e| anyhow!("parse error in {}: {:?}", path, e))?;

        // Strip TypeScript types before the bundler sees the AST — its internal
        // optimization passes do not support TypeScript nodes and will panic.
        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        let mut program = Program::Module(module);
        program.visit_mut_with(&mut make_resolver(unresolved_mark, top_level_mark, true));
        strip(unresolved_mark, top_level_mark).process(&mut program);
        let module = program.expect_module();

        Ok(ModuleData {
            fm,
            module,
            helpers: Default::default(),
        })
    }
}

struct MemoryResolver {
    files: Files,
    packages: HashMap<String, String>,
}

impl MemoryResolver {
    fn new(files: Files) -> Self {
        let packages = build_package_map(&files);
        Self { files, packages }
    }
}

impl Resolve for MemoryResolver {
    fn resolve(&self, base: &FileName, specifier: &str) -> anyhow::Result<Resolution> {
        let base_path = match base {
            FileName::Custom(s) => s.as_str(),
            _ => "",
        };

        let resolved = if specifier.starts_with('.') {
            let normalized = RelativePath::new(base_path)
                .parent()
                .unwrap_or(RelativePath::new(""))
                .join_normalized(specifier)
                .into_string();
            try_resolve(&self.files, &normalized)
                .ok_or_else(|| anyhow!("cannot resolve '{}' from '{}'", specifier, base_path))?
        } else {
            self.packages
                .get(specifier)
                .cloned()
                .ok_or_else(|| anyhow!("cannot resolve bare specifier: '{}'", specifier))?
        };

        Ok(Resolution {
            filename: FileName::Custom(resolved),
            slug: None,
        })
    }
}

fn build_package_map(files: &Files) -> HashMap<String, String> {
    let mut packages = HashMap::new();
    for (path, content) in files.iter() {
        let dir = match path.strip_suffix("/package.json") {
            Some(dir) => dir,
            None => continue,
        };
        let Ok(pkg) = serde_json::from_slice::<serde_json::Value>(content.as_ref()) else {
            continue;
        };
        let Some(name) = pkg["name"].as_str() else {
            continue;
        };
        // We are hardcoding "well known" entry points for now as we are operating on files from
        // the repository directly, not actually packaged files, so we cannot use the pakcage.json
        // "main" entry for example.
        for entry in &["src/index.ts", "src/entries/main.ts"] {
            let entry_path = format!("{}/{}", dir, entry);
            if files.contains_key(&entry_path) {
                packages.insert(name.to_string(), entry_path);
                break;
            }
        }
    }
    packages
}

fn try_resolve(files: &Files, path: &str) -> Option<String> {
    if files.contains_key(path) {
        return Some(path.to_string());
    }
    for suffix in [".ts", ".tsx", "/index.ts", "/index.tsx"] {
        let candidate = format!("{}{}", path, suffix);
        if files.contains_key(&candidate) {
            return Some(candidate);
        }
    }
    None
}

struct NoopHook;

impl Hook for NoopHook {
    fn get_import_meta_props(
        &self,
        _span: Span,
        _record: &ModuleRecord,
    ) -> anyhow::Result<Vec<KeyValueProp>> {
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_files(entries: &[(&str, &str)]) -> Files {
        std::sync::Arc::new(
            entries
                .iter()
                .map(|(k, v)| (k.to_string(), BytesStr::from_str_slice(v)))
                .collect(),
        )
    }

    #[test]
    fn resolves_src_index() {
        let files = make_files(&[
            (
                "packages/logs/package.json",
                r#"{"name": "@datadog/browser-logs"}"#,
            ),
            ("packages/logs/src/index.ts", ""),
        ]);
        let map = build_package_map(&files);
        assert_eq!(
            map.get("@datadog/browser-logs").map(String::as_str),
            Some("packages/logs/src/index.ts")
        );
    }

    #[test]
    fn prefers_src_index_over_entries_main() {
        let files = make_files(&[
            (
                "packages/rum/package.json",
                r#"{"name": "@datadog/browser-rum"}"#,
            ),
            ("packages/rum/src/index.ts", ""),
            ("packages/rum/src/entries/main.ts", ""),
        ]);
        let map = build_package_map(&files);
        assert_eq!(
            map.get("@datadog/browser-rum").map(String::as_str),
            Some("packages/rum/src/index.ts")
        );
    }

    #[test]
    fn falls_back_to_entries_main() {
        let files = make_files(&[
            (
                "packages/rum/package.json",
                r#"{"name": "@datadog/browser-rum"}"#,
            ),
            ("packages/rum/src/entries/main.ts", ""),
        ]);
        let map = build_package_map(&files);
        assert_eq!(
            map.get("@datadog/browser-rum").map(String::as_str),
            Some("packages/rum/src/entries/main.ts")
        );
    }

    #[test]
    fn skips_package_without_entry_file() {
        let files = make_files(&[(
            "packages/rum/package.json",
            r#"{"name": "@datadog/browser-rum"}"#,
        )]);
        let map = build_package_map(&files);
        assert!(!map.contains_key("@datadog/browser-rum"));
    }

    #[test]
    fn skips_invalid_json() {
        let files = make_files(&[
            ("packages/rum/package.json", "not json"),
            ("packages/rum/src/index.ts", ""),
        ]);
        let map = build_package_map(&files);
        assert!(map.is_empty());
    }

    #[test]
    fn skips_package_json_without_name() {
        let files = make_files(&[
            ("packages/rum/package.json", r#"{"version": "1.0.0"}"#),
            ("packages/rum/src/index.ts", ""),
        ]);
        let map = build_package_map(&files);
        assert!(map.is_empty());
    }

    #[test]
    fn ignores_non_package_json_files() {
        let files = make_files(&[("packages/rum/src/index.ts", "export const x = 1;")]);
        let map = build_package_map(&files);
        assert!(map.is_empty());
    }
}
