// ⚠️ Backward-compat re-exports of APIs that have moved to @datadog/js-core.
//
// These symbols are re-exported from @datadog/browser-core so existing consumers importing them
// from @datadog/browser-core keep working — removing them is a breaking change that must wait for
// the next major Browser SDK release. When that release lands, delete this file and its re-export
// in index.ts, and let consumers import from @datadog/js-core directly.
//
// Keep every js-core compat re-export in this file so the cleanup is a single deletion.
// Grep tag: js-core-compat-reexport
export { dateNow } from '@datadog/js-core/time'
