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
    const { getAllDatacenters } = await import('./datacenter.ts')
    const datacenters = await getAllDatacenters()

    assert.deepStrictEqual(datacenters, ['ap1', 'ap2', 'eu1', 'us1', 'us3', 'us5', 'prtest00', 'prtest01'])
  })

  it('should return site for a given datacenter', async () => {
    const { getSite } = await import('./datacenter.ts')
    const site = await getSite('us1')

    assert.strictEqual(site, 'datadoghq.com')
  })

  it('should filter minor datacenters (excluding major and private)', async () => {
    const { getAllMinorDcs } = await import('./datacenter.ts')
    const minorDcs = await getAllMinorDcs()

    assert.deepStrictEqual(minorDcs, ['ap1', 'ap2', 'us3', 'us5'])
  })

  it('should filter private datacenters (starting with pr)', async () => {
    const { getAllPrivateDcs } = await import('./datacenter.ts')
    const privateDcs = await getAllPrivateDcs()

    assert.deepStrictEqual(privateDcs, ['prtest00', 'prtest01'])
  })

  it('should fetch vault token with correct headers', async () => {
    await import('./datacenter.ts')

    const vaultCall = fetchHandlingErrorMock.mock.calls.find((call) =>
      call.arguments[0].includes('/v1/identity/oidc/token/runtime-metadata-service')
    )
    assert.ok(vaultCall)
    assert.deepStrictEqual(vaultCall.arguments[1]?.headers, { 'X-Vault-Request': 'true' })
  })

  it('should fetch datacenters with vault token authorization', async () => {
    await import('./datacenter.ts')

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
    const { getAllDatacenters, getSite } = await import('./datacenter.ts')

    // Module may already be initialized from previous tests
    // Make multiple calls and verify no additional API calls are made
    const initialCallCount = fetchHandlingErrorMock.mock.calls.length

    await getAllDatacenters()
    await getSite('us1')
    await getAllDatacenters()
    await getSite('eu1')

    const finalCallCount = fetchHandlingErrorMock.mock.calls.length

    // Should not make any new API calls since data is cached (whether cached from this test or previous tests)
    assert.strictEqual(finalCallCount, initialCallCount, 'Should not make additional API calls when cached')
  })
})
