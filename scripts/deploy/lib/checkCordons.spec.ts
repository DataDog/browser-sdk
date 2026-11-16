import assert from 'node:assert/strict'
import path from 'node:path'
import { afterEach, before, beforeEach, describe, it, mock, type Mock } from 'node:test'
import { mockModule } from './testHelpers.ts'
import type { CordonTarget } from './checkCordons.ts'

const US1_DATACENTER_CORDON = {
  name: 'cordon-us1',
  resourceType: 'datacenter',
  resourceId: 'us1.prod.dog',
  incidentId: 'incident-123',
  description: 'Stop deployments in us1',
  createdBy: 'someone@datadoghq.com',
  soft: false,
}

const PROD_ENVIRONMENT_CORDON = {
  name: 'cordon-prod',
  resourceType: 'environment',
  resourceId: 'prod',
  description: 'Planned freeze',
  soft: true,
}

describe('checkCordons', () => {
  const fetchRuntimeMetadataServiceMock: Mock<(path: string) => Promise<unknown>> = mock.fn()
  const printWarningMock = mock.fn()
  let checkCordons: (targets: CordonTarget[]) => Promise<void>
  let datacenterToCordonTargets: (datacenter: string) => CordonTarget[]

  function mockCordonResponses(responses: Record<string, unknown>): void {
    fetchRuntimeMetadataServiceMock.mock.mockImplementation((requestPath: string) => {
      if (requestPath in responses) {
        return Promise.resolve(responses[requestPath])
      }
      return Promise.resolve({ cordons: [], nextPageToken: '' })
    })
  }

  function requestedPaths(): string[] {
    return fetchRuntimeMetadataServiceMock.mock.calls.map((call) => call.arguments[0])
  }

  function warnings(): string {
    return printWarningMock.mock.calls.map((call) => String(call.arguments[0])).join('\n')
  }

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../../lib/runtimeMetadataService.ts'), {
      fetchRuntimeMetadataService: fetchRuntimeMetadataServiceMock,
    })
    await mockModule(path.resolve(import.meta.dirname, '../../lib/executionUtils.ts'), {
      printLog: mock.fn(),
      printWarning: printWarningMock,
    })
    ;({ checkCordons, datacenterToCordonTargets } = await import('./checkCordons.ts'))
  })

  beforeEach(() => {
    delete process.env.OVERRIDE_CORDON
    fetchRuntimeMetadataServiceMock.mock.resetCalls()
    printWarningMock.mock.resetCalls()
    mockCordonResponses({})
  })

  afterEach(() => {
    delete process.env.OVERRIDE_CORDON
  })

  describe('datacenterToCordonTargets', () => {
    it('should map a commercial datacenter to its RMS name', () => {
      assert.deepEqual(datacenterToCordonTargets('us1'), [{ type: 'datacenter', name: 'us1.prod.dog' }])
    })

    it('should map gov to both gov datacenters', () => {
      assert.deepEqual(datacenterToCordonTargets('gov'), [
        { type: 'datacenter', name: 'us1.fed.dog' },
        { type: 'datacenter', name: 'us2.fed.dog' },
      ])
    })
  })

  it('should resolve when no cordon is active', async () => {
    await checkCordons([
      { type: 'datacenter', name: 'us1.prod.dog' },
      { type: 'environment', name: 'prod' },
    ])

    assert.deepEqual(requestedPaths(), ['/v2/datacenters/us1.prod.dog/cordons', '/v2/environments/prod/cordons'])
  })

  it('should throw when a datacenter cordon is active', async () => {
    mockCordonResponses({ '/v2/datacenters/us1.prod.dog/cordons': { cordons: [US1_DATACENTER_CORDON] } })

    await assert.rejects(checkCordons([{ type: 'datacenter', name: 'us1.prod.dog' }]), (error: Error) => {
      assert.match(error.message, /Active cordons for us1\.prod\.dog/)
      assert.match(error.message, /cordon-us1: datacenter us1\.prod\.dog, hard, incident-123/)
      assert.match(error.message, /Stop deployments in us1/)
      assert.match(error.message, /OVERRIDE_CORDON=/)
      return true
    })
  })

  it('should throw when an environment cordon applies to a datacenter', async () => {
    mockCordonResponses({ '/v2/datacenters/eu1.prod.dog/cordons': { cordons: [PROD_ENVIRONMENT_CORDON] } })

    await assert.rejects(
      checkCordons([{ type: 'datacenter', name: 'eu1.prod.dog' }]),
      /cordon-prod: environment prod, soft, Planned freeze/
    )
  })

  it('should list a cordon reported by several targets only once', async () => {
    mockCordonResponses({
      '/v2/datacenters/us1.fed.dog/cordons': { cordons: [PROD_ENVIRONMENT_CORDON] },
      '/v2/datacenters/us2.fed.dog/cordons': { cordons: [PROD_ENVIRONMENT_CORDON] },
    })

    await assert.rejects(
      checkCordons([
        { type: 'datacenter', name: 'us1.fed.dog' },
        { type: 'datacenter', name: 'us2.fed.dog' },
      ]),
      (error: Error) => {
        assert.equal(error.message.match(/cordon-prod/g)?.length, 1)
        return true
      }
    )
  })

  it('should follow pagination', async () => {
    mockCordonResponses({
      '/v2/datacenters/us1.prod.dog/cordons': { cordons: [], nextPageToken: 'page 2' },
      '/v2/datacenters/us1.prod.dog/cordons?pageToken=page%202': { cordons: [US1_DATACENTER_CORDON] },
    })

    await assert.rejects(checkCordons([{ type: 'datacenter', name: 'us1.prod.dog' }]), /cordon-us1/)
    assert.equal(fetchRuntimeMetadataServiceMock.mock.callCount(), 2)
  })

  it('should resolve and log the bypass when OVERRIDE_CORDON is set', async () => {
    process.env.OVERRIDE_CORDON = 'https://example.com/incident-123'
    mockCordonResponses({ '/v2/datacenters/us1.prod.dog/cordons': { cordons: [US1_DATACENTER_CORDON] } })

    await checkCordons([{ type: 'datacenter', name: 'us1.prod.dog' }])

    assert.match(warnings(), /Bypassing active cordons for us1\.prod\.dog/)
    assert.match(warnings(), /cordon-us1/)
    assert.match(warnings(), /Reason: https:\/\/example\.com\/incident-123/)
  })

  it('should ignore a blank OVERRIDE_CORDON', async () => {
    process.env.OVERRIDE_CORDON = '  '
    mockCordonResponses({ '/v2/datacenters/us1.prod.dog/cordons': { cordons: [US1_DATACENTER_CORDON] } })

    await assert.rejects(checkCordons([{ type: 'datacenter', name: 'us1.prod.dog' }]), /Active cordons/)
  })

  it('should fail closed without retrying when the cordons cannot be fetched', async () => {
    fetchRuntimeMetadataServiceMock.mock.mockImplementation(() => Promise.reject(new Error('RMS unavailable')))

    await assert.rejects(checkCordons([{ type: 'datacenter', name: 'us1.prod.dog' }]), (error: Error) => {
      assert.match(error.message, /Failed to check cordons for us1\.prod\.dog/)
      assert.equal((error.cause as Error).message, 'RMS unavailable')
      return true
    })
    assert.equal(fetchRuntimeMetadataServiceMock.mock.callCount(), 1)
  })

  it('should resolve when the cordons cannot be fetched and OVERRIDE_CORDON is set', async () => {
    process.env.OVERRIDE_CORDON = 'https://example.com/incident-123'
    fetchRuntimeMetadataServiceMock.mock.mockImplementation(() => Promise.reject(new Error('RMS unavailable')))

    await checkCordons([{ type: 'datacenter', name: 'us1.prod.dog' }])

    assert.match(warnings(), /Failed to check cordons/)
    assert.match(warnings(), /Reason: https:\/\/example\.com\/incident-123/)
  })
})
