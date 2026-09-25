// SPIKE-ONLY: temporary CDN-style entry so the sandbox dev server can serve this plugin as a
// <script> global, matching how a customer's own bundler would tree-shake it in for real. Not
// part of the package's real public API surface (see src/index.ts). Remove before merging
// anything from this branch.
import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import { longTaskPlugin } from '../index'

interface BrowserWindow {
  longTaskPlugin?: typeof longTaskPlugin
}
// Spike-only entry, not added to eslint-local-rules/disallowSideEffects.ts's permanent allowlist
// on purpose since this file shouldn't outlive the spike.
// eslint-disable-next-line local-rules/disallow-side-effects
defineGlobal(globalObject as BrowserWindow, 'longTaskPlugin', longTaskPlugin)
