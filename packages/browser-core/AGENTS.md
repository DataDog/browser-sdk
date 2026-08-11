# `@datadog/browser-core` package

`@datadog/browser-core` is primarily consumed by other `@datadog/browser-*` packages within this
monorepo. It is published to npm but **not supported for external use** and carries **no semver
stability guarantee**.

## Breaking changes are allowed

External consumers exist but are unsupported — we do not guarantee compatibility for them. You may
freely:

- Remove or rename exported symbols
- Change function signatures (parameters, return types, arity)
- Reorganize modules and re-exports

When migrating code from `@datadog/browser-core` to `@datadog/js-core`, do **not** keep a
backward-compatible re-export in `browser-core` just to avoid a "breaking change" — there is no
breaking change here. Move the code and update all internal call sites directly.

Review comments that warn about "breaking changes" in this package (e.g. removed exports,
signature changes) are **not applicable** and should be disregarded.
