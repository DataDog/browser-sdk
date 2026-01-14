import { describe, it, before, mock, type Mock } from 'node:test'
import assert from 'node:assert'
import path from 'node:path'
import { mockModule, mockFetchHandlingError, FAKE_RUNTIME_METADATA_SERVICE_TOKEN } from '../deploy/lib/testHelpers.ts'
import type { fetchHandlingError } from './executionUtils.ts'

describe('datacenter', () => {
  const fetchHandlingErrorMock: Mock<typeof fetchHandlingError> = mock.fn()

  before(async () => {
    // Setup mock before importing the module
    mockFetchHandlingError(fetchHandlingErrorMock)

    await mockModule(path.resolve(import.meta.dirname, './executionUtils.ts'), {
      fetchHandlingError: fetchHandlingErrorMock,
    })
  })

  it('should fetch all datacenters from runtime-metadata-service', async () => {
    const { getAllDatacentersMetadata, DatacenterType } = await import('./datacenter.ts')
    const datacenters = await getAllDatacentersMetadata()

    assert.deepStrictEqual(datacenters, [
      {
        name: 'ap1',
        site: 'ap1.datadoghq.com',
        type: DatacenterType.MINOR,
      },
      {
        name: 'ap2',
        site: 'ap2.datadoghq.com',
        type: DatacenterType.MINOR,
      },
      {
        name: 'eu1',
        site: 'datadoghq.eu',
        type: DatacenterType.MAJOR,
      },
      {
        name: 'us1',
        site: 'datadoghq.com',
        type: DatacenterType.MAJOR,
      },
      {
        name: 'us3',
        site: 'us3.datadoghq.com',
        type: DatacenterType.MINOR,
      },
      {
        name: 'us5',
        site: 'us5.datadoghq.com',
        type: DatacenterType.MINOR,
      },
      {
        name: 'prtest00',
        site: 'prtest00.datadoghq.com',
        type: DatacenterType.PRIVATE,
      },
      {
        name: 'prtest01',
        site: 'prtest01.datadoghq.com',
        type: DatacenterType.PRIVATE,
      },
    ])
  })

  it('should fetch vault token with correct headers', async () => {
    const { getAllDatacentersMetadata } = await import('./datacenter.ts')
    await getAllDatacentersMetadata()

    const vaultCall = fetchHandlingErrorMock.mock.calls.find((call) =>
      call.arguments[0].includes('/v1/identity/oidc/token/runtime-metadata-service')
    )
    assert.ok(vaultCall)
    assert.deepStrictEqual(vaultCall.arguments[1]?.headers, { 'X-Vault-Request': 'true' })
  })

  it('should fetch datacenters with vault token authorization', async () => {
    const { getAllDatacentersMetadata } = await import('./datacenter.ts')
    await getAllDatacentersMetadata()

    const datacentersCall = fetchHandlingErrorMock.mock.calls.find((call) =>
      call.arguments[0].includes('runtime-metadata-service.us1.ddbuild.io/v2/datacenters')
    )
    assert.ok(datacentersCall)
    assert.ok(
      datacentersCall.arguments[0].includes(
        `selector=${encodeURIComponent('datacenter.environment == "prod" && datacenter.flavor == "site"')}`
      ),
      'URL should include selector for prod environment and site flavor'
    )
    assert.deepStrictEqual(datacentersCall.arguments[1]?.headers, {
      accept: 'application/json',
      Authorization: `Bearer ${FAKE_RUNTIME_METADATA_SERVICE_TOKEN}`,
    })
  })

  it('should cache datacenter metadata across multiple calls', async () => {
    const { getAllDatacentersMetadata } = await import('./datacenter.ts')

    // Module may already be initialized from previous tests
    // Make multiple calls and verify no additional API calls are made
    const initialCallCount = fetchHandlingErrorMock.mock.calls.length

    await getAllDatacentersMetadata()
    await getAllDatacentersMetadata()
    await getAllDatacentersMetadata()

    const finalCallCount = fetchHandlingErrorMock.mock.calls.length

    // Should not make any new API calls since data is cached (whether cached from this test or previous tests)
    assert.strictEqual(finalCallCount, initialCallCount, 'Should not make additional API calls when cached')
  })
})
