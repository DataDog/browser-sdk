import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getPackageName } from './computeBundleSize.ts'

describe('getPackageName', () => {
  const cases: Array<[file: string, expected: string]> = [
    ['datadog-rum.js', 'rum'],
    ['datadog-logs.js', 'logs'],
    ['datadog-rum-slim.js', 'rum_slim'],
    ['worker.js', 'worker'],
    ['datadog-rum-salesforce.js', 'rum_salesforce'],
    ['chunks/datadogProfiler-3cbd6ffef10ac40eb2cd-datadog-rum.js', 'rum_profiler'],
    ['chunks/datadogRecorder-531f1c41bdc9a22e4845-datadog-rum.js', 'rum_recorder'],
    ['chunks/datadogProfiler-3cbd6ffef10ac40eb2cd-datadog-rum-salesforce.js', 'rum_salesforce_profiler'],
    ['chunks/datadogRecorder-4ace47c1ea1f698b8e26-datadog-rum-shopify.js', 'rum_shopify_recorder'],
  ]

  for (const [file, expected] of cases) {
    it(`should return ${expected} for ${file}`, () => {
      assert.equal(getPackageName(file), expected)
    })
  }
})
