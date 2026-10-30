import assert from 'node:assert/strict'
import path from 'node:path'
import type { Mock } from 'node:test'
import { afterEach, before, describe, it, mock } from 'node:test'
import { mockModule } from './testHelpers.ts'
import type { QueryResultBucket } from './checkTelemetryErrors.ts'

const FAKE_API_KEY = 'FAKE_API_KEY'
const FAKE_APPLICATION_KEY = 'FAKE_APPLICATION_KEY'

const NO_TELEMETRY_ERRORS_MOCK = [{ computes: { c0: 40 }, by: { '@datacenter': 'us1' } }]
const NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK = [
  { by: { '@datacenter': 'us1', '@org_id': 123456 }, computes: { c0: 22 } },
  { by: { '@datacenter': 'us1', '@org_id': 789012 }, computes: { c0: 3 } },
  { by: { '@datacenter': 'us1', '@org_id': 345678 }, computes: { c0: 3 } },
]
const NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK = [
  { by: { '@datacenter': 'us1', 'issue.id': 'b4a4bf0c-e64a-11ef-aa16-da7ad0900002' }, computes: { c0: 16 } },
  { by: { '@datacenter': 'us1', 'issue.id': '0aedaf4a-da09-11ed-baef-da7ad0900002' }, computes: { c0: 9 } },
  { by: { '@datacenter': 'us1', 'issue.id': '118a6a40-1454-11f0-82c6-da7ad0900002' }, computes: { c0: 1 } },
  { by: { '@datacenter': 'us1', 'issue.id': '144e312a-919a-11ef-8519-da7ad0900002' }, computes: { c0: 1 } },
]
const TELEMETRY_ERRORS_MOCK = [{ computes: { c0: 10000 }, by: { '@datacenter': 'us1' } }]
const TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK = [
  { by: { '@datacenter': 'us1', '@org_id': 123456 }, computes: { c0: 500 } },
  { by: { '@datacenter': 'us1', '@org_id': 789012 }, computes: { c0: 3 } },
  { by: { '@datacenter': 'us1', '@org_id': 345678 }, computes: { c0: 3 } },
]
const TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK = [
  { by: { '@datacenter': 'us1', 'issue.id': 'b4a4bf0c-e64a-11ef-aa16-da7ad0900002' }, computes: { c0: 1600 } },
  { by: { '@datacenter': 'us1', 'issue.id': '0aedaf4a-da09-11ed-baef-da7ad0900002' }, computes: { c0: 9 } },
  { by: { '@datacenter': 'us1', 'issue.id': '118a6a40-1454-11f0-82c6-da7ad0900002' }, computes: { c0: 1 } },
  { by: { '@datacenter': 'us1', 'issue.id': '144e312a-919a-11ef-8519-da7ad0900002' }, computes: { c0: 1 } },
]

describe('check-telemetry-errors', () => {
  let checkTelemetryErrors: (datacenters: string[], version: string) => Promise<void>
  const fetchMock: Mock<typeof globalThis.fetch> = mock.fn()

  function mockFetch(responseBuckets: [QueryResultBucket[], QueryResultBucket[], QueryResultBucket[]]): void {
    for (let i = 0; i < 3; i++) {
      fetchMock.mock.mockImplementationOnce(
        () =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  buckets: responseBuckets[i],
                },
              }),
          } as unknown as Response),
        i
      )
    }
  }

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../../lib/secrets.ts'), {
      getOrg2ApiKey: () => FAKE_API_KEY,
      getOrg2AppKey: () => FAKE_APPLICATION_KEY,
    })

    await mockModule('undici', { fetch: fetchMock })

    await mockModule(path.resolve(import.meta.dirname, '../../lib/executionUtils.ts'), {
      timeout: mock.fn(() => Promise.resolve()),
    })

    checkTelemetryErrors = (await import('./checkTelemetryErrors.ts')).checkTelemetryErrors
  })

  afterEach(() => {
    fetchMock.mock.resetCalls()
  })

  it('should not throw an error if no telemetry errors are found for a given datacenter', async () => {
    mockFetch([
      NO_TELEMETRY_ERRORS_MOCK,
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.doesNotReject(() => checkTelemetryErrors(['us1'], '6.2.1'))
  })

  it('should throw an error if telemetry errors are found for a given datacenter', async () => {
    mockFetch([
      TELEMETRY_ERRORS_MOCK,
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])
    await assert.rejects(
      () => checkTelemetryErrors(['us1'], '6.2.1'),
      /\[us1\] Telemetry errors: found 10000 events \(threshold: 300\) in the last 5 minutes/
    )
  })

  it('should throw an error if telemetry errors on specific org are found for a given datacenter', async () => {
    mockFetch([
      NO_TELEMETRY_ERRORS_MOCK,
      TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.rejects(
      () => checkTelemetryErrors(['us1'], '6.2.1'),
      /\[us1\] Telemetry errors on specific org: found 500 events \(threshold: 100\) in the last 5 minutes/
    )
  })

  it('should throw an error if telemetry errors on specific message are found for a given datacenter', async () => {
    mockFetch([
      NO_TELEMETRY_ERRORS_MOCK,
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.rejects(
      () => checkTelemetryErrors(['us1'], '6.2.1'),
      /\[us1\] Telemetry error on specific message: found 1600 events \(threshold: 100\) in the last 5 minutes/
    )
  })

  it('should query org2 telemetry for the given datacenters and version, excluding known issues', async () => {
    mockFetch([[], [], []])

    await checkTelemetryErrors(['us1', 'eu1'], '6.2.1')

    const [url, init] = fetchMock.mock.calls[0].arguments
    assert.strictEqual(url, 'https://api.datadoghq.com/api/v2/logs/analytics/aggregate')
    assert.strictEqual((init?.headers as Record<string, string>)['DD-API-KEY'], FAKE_API_KEY)
    assert.strictEqual((init?.headers as Record<string, string>)['DD-APPLICATION-KEY'], FAKE_APPLICATION_KEY)

    const bodies = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse(call.arguments[1]?.body as string) as {
          filter: { indexes: string[]; query: string }
          group_by: Array<{ facet: string }>
        }
    )
    for (const body of bodies) {
      assert.deepEqual(body.filter.indexes, ['rum-sdk-telemetry-logs'])
      assert.strictEqual(
        body.filter.query,
        '@ddsource:browser status:error @version:6.2.1 @datacenter:(us1 OR eu1) -@known_issue_status:*'
      )
    }
    assert.deepEqual(
      bodies.map((body) => body.group_by.map((groupBy) => groupBy.facet)),
      [['@datacenter'], ['@datacenter', '@org_id'], ['@datacenter', 'issue.id']]
    )
  })

  it('should report the datacenter where the threshold is exceeded', async () => {
    mockFetch([
      [
        { by: { '@datacenter': 'us1' }, computes: { c0: 40 } },
        { by: { '@datacenter': 'eu1' }, computes: { c0: 400 } },
      ],
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.rejects(
      () => checkTelemetryErrors(['us1', 'eu1'], '6.2.1'),
      /\[eu1\] Telemetry errors: found 400 events \(threshold: 300\) in the last 5 minutes/
    )
  })

  it('should not throw and report 0 events when no buckets are returned', async () => {
    mockFetch([[], [], []])

    await assert.doesNotReject(() => checkTelemetryErrors(['us1'], '6.2.1'))
  })

  it('should throw an error if the API returns an unexpected response format', async () => {
    // Mock first API call with invalid response (missing data.buckets)
    fetchMock.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              error: 'Something went wrong',
            }),
        } as unknown as Response),
      0
    )

    await assert.rejects(() => checkTelemetryErrors(['us1'], '6.2.1'), /Unexpected response from the API/)
  })

  it('should throw an error if buckets have invalid structure', async () => {
    // Mock first API call with invalid bucket structure (missing computes.c0)
    fetchMock.mock.mockImplementationOnce(
      () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                buckets: [{ by: {}, computes: {} }], // Missing c0
              },
            }),
        } as unknown as Response),
      0
    )

    await assert.rejects(() => checkTelemetryErrors(['us1'], '6.2.1'), /Unexpected response from the API/)
  })
})
