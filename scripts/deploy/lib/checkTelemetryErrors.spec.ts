import assert from 'node:assert/strict'
import path from 'node:path'
import type { Mock } from 'node:test'
import { afterEach, before, describe, it, mock } from 'node:test'
import type { Response, RequestInit } from 'undici'
import type { fetchHandlingError } from 'scripts/lib/executionUtils.ts'
import { mockModule } from './testHelpers.ts'
import type { QueryResultBucket } from './checkTelemetryErrors.ts'

const FAKE_API_KEY = 'FAKE_API_KEY'
const FAKE_APPLICATION_KEY = 'FAKE_APPLICATION_KEY'

const NO_TELEMETRY_ERRORS_MOCK = [{ computes: { c0: 40 }, by: {} }]
const NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK = [
  { by: { '@org_id': 123456 }, computes: { c0: 22 } },
  { by: { '@org_id': 789012 }, computes: { c0: 3 } },
  { by: { '@org_id': 345678 }, computes: { c0: 3 } },
]
const NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK = [
  { by: { 'issue.id': 'b4a4bf0c-e64a-11ef-aa16-da7ad0900002' }, computes: { c0: 16 } },
  { by: { 'issue.id': '0aedaf4a-da09-11ed-baef-da7ad0900002' }, computes: { c0: 9 } },
  { by: { 'issue.id': '118a6a40-1454-11f0-82c6-da7ad0900002' }, computes: { c0: 1 } },
  { by: { 'issue.id': '144e312a-919a-11ef-8519-da7ad0900002' }, computes: { c0: 1 } },
]
const TELEMETRY_ERRORS_MOCK = [{ computes: { c0: 10000 }, by: {} }]
const TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK = [
  { by: { '@org_id': 123456 }, computes: { c0: 500 } },
  { by: { '@org_id': 789012 }, computes: { c0: 3 } },
  { by: { '@org_id': 345678 }, computes: { c0: 3 } },
]
const TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK = [
  { by: { 'issue.id': 'b4a4bf0c-e64a-11ef-aa16-da7ad0900002' }, computes: { c0: 1600 } },
  { by: { 'issue.id': '0aedaf4a-da09-11ed-baef-da7ad0900002' }, computes: { c0: 9 } },
  { by: { 'issue.id': '118a6a40-1454-11f0-82c6-da7ad0900002' }, computes: { c0: 1 } },
  { by: { 'issue.id': '144e312a-919a-11ef-8519-da7ad0900002' }, computes: { c0: 1 } },
]

describe('check-telemetry-errors', () => {
  let checkTelemetryErrors: (datacenters: string[], version: string) => Promise<void>
  const fetchHandlingErrorMock: Mock<typeof fetchHandlingError> = mock.fn()

  function mockFetchHandlingError(
    responseBuckets: [QueryResultBucket[], QueryResultBucket[], QueryResultBucket[]]
  ): void {
    for (let i = 0; i < 3; i++) {
      fetchHandlingErrorMock.mock.mockImplementationOnce(
        (_url: string, _options?: RequestInit) =>
          Promise.resolve({
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
      getTelemetryOrgApiKey: () => FAKE_API_KEY,
      getTelemetryOrgApplicationKey: () => FAKE_APPLICATION_KEY,
    })

    await mockModule(path.resolve(import.meta.dirname, '../../lib/executionUtils.ts'), {
      fetchHandlingError: fetchHandlingErrorMock,
      timeout: mock.fn(() => Promise.resolve()),
    })

    await mockModule(path.resolve(import.meta.dirname, '../../lib/datacenter.ts'), {
      getDatacenterMetadata: () =>
        Promise.resolve({
          name: 'us1',
          site: 'datadoghq.com',
          type: 'major' as const,
        }),
    })

    checkTelemetryErrors = (await import('./checkTelemetryErrors.ts')).checkTelemetryErrors
  })

  afterEach(() => {
    fetchHandlingErrorMock.mock.resetCalls()
  })

  it('should not throw an error if no telemetry errors are found for a given datacenter', async () => {
    mockFetchHandlingError([
      NO_TELEMETRY_ERRORS_MOCK,
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.doesNotReject(() => checkTelemetryErrors(['us1'], '6.2.1'))
  })

  it('should throw an error if telemetry errors are found for a given datacenter', async () => {
    mockFetchHandlingError([
      TELEMETRY_ERRORS_MOCK,
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])
    await assert.rejects(() => checkTelemetryErrors(['us1'], '6.2.1'), /Telemetry errors found in the last 5 minutes/)
  })

  it('should throw an error if telemetry errors on specific org are found for a given datacenter', async () => {
    mockFetchHandlingError([
      NO_TELEMETRY_ERRORS_MOCK,
      TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      NO_TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.rejects(
      () => checkTelemetryErrors(['us1'], '6.2.1'),
      /Telemetry errors on specific org found in the last 5 minutes/
    )
  })

  it('should throw an error if telemetry errors on specific message are found for a given datacenter', async () => {
    mockFetchHandlingError([
      NO_TELEMETRY_ERRORS_MOCK,
      NO_TELEMETRY_ERRORS_ON_SPECIFIC_ORG_MOCK,
      TELEMETRY_ERROR_ON_SPECIFIC_MESSAGE_MOCK,
    ])

    await assert.rejects(
      () => checkTelemetryErrors(['us1'], '6.2.1'),
      /Telemetry error on specific message found in the last 5 minutes/
    )
  })

  it('should throw an error if the API returns an unexpected response format', async () => {
    // Mock first API call with invalid response (missing data.buckets)
    fetchHandlingErrorMock.mock.mockImplementationOnce(
      (_url: string, _options?: RequestInit) =>
        Promise.resolve({
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
    fetchHandlingErrorMock.mock.mockImplementationOnce(
      (_url: string, _options?: RequestInit) =>
        Promise.resolve({
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
