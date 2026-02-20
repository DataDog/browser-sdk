---
status: testing
phase: 05-core-generator
source: 05-SUMMARY.md
started: 2026-02-04T12:45:00Z
updated: 2026-02-04T12:45:00Z
---

## Current Test

number: 4
name: CLI generates single JavaScript file
expected: |
Output is a single .js file containing IIFE wrapper with both SDK and config combined
awaiting: user response

## Tests

### 1. CLI tool accepts required parameters

expected: CLI accepts --applicationId, --configId, --variant flags and shows help with --help option
result: issue
reported: "Generated bundle fails in the browser because remote config structure from @datadog/browser-remote-config is not compatible with what DD_RUM.init() expects"
severity: major

### 2. CLI downloads SDK from CDN

expected: CLI successfully downloads SDK bundles from Datadog CDN and includes them in output
result: pass

### 3. CLI fetches remote configuration

expected: CLI successfully fetches remote configuration using provided applicationId and configId
result: pass

### 4. CLI generates single JavaScript file

expected: Output is a single .js file containing IIFE wrapper with both SDK and config combined
result: [pending]

### 5. Generated bundle has deterministic output

expected: Running generator twice with same inputs produces identical byte-for-byte output
result: [pending]

### 6. CLI supports rum variant

expected: Using --variant rum generates bundle with full rum SDK (not rum-slim)
result: [pending]

### 7. CLI supports rum-slim variant

expected: Using --variant rum-slim generates bundle with lightweight rum-slim SDK
result: [pending]

### 8. Generated bundle includes SDK version

expected: Generated bundle header comment shows SDK version that was downloaded
result: [pending]

### 9. Generated bundle auto-initializes SDK

expected: Bundle includes auto-init code that calls DD_RUM.init() with embedded config after SDK loads
result: [pending]

### 10. CLI validates required arguments

expected: CLI shows clear error message when required arguments (applicationId, configId, variant) are missing
result: [pending]

## Summary

total: 10
passed: 2
issues: 1
pending: 7
skipped: 0

## Gaps

- truth: "Generated bundle can be loaded in browser and SDK initializes with embedded config without network requests"
  status: failed
  reason: "User reported: Generated bundle fails in the browser because remote config structure from @datadog/browser-remote-config is not compatible with what DD_RUM.init() expects"
  severity: major
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
