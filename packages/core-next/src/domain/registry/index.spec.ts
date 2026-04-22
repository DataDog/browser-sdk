import { getSdk, registerSdk, unregisterSdk, registerBridge, connectBridges } from './index'
import { Pipeline } from '../pipeline'

describe('registry', () => {
  afterEach(() => {
    unregisterSdk('default')
    unregisterSdk('a')
    unregisterSdk('b')
  })

  it('should round-trip registerSdk and getSdk', () => {
    const sdk = { version: '1.0.0' }

    registerSdk('default', sdk)

    expect(getSdk('default')).toBe(sdk)
  })

  it('should return undefined when not registered', () => {
    expect(getSdk('default')).toBeUndefined()
  })

  it('should default to "default" id when called without arguments', () => {
    const sdk = { name: 'my-sdk' }

    registerSdk('default', sdk)

    expect(getSdk()).toBe(sdk)
  })

  it('should remove the instance after unregisterSdk', () => {
    registerSdk('default', { name: 'my-sdk' })
    unregisterSdk()

    expect(getSdk()).toBeUndefined()
  })

  it('should support multiple instances with different ids independently', () => {
    const sdkA = { name: 'sdk-a' }
    const sdkB = { name: 'sdk-b' }

    registerSdk('a', sdkA)
    registerSdk('b', sdkB)

    expect(getSdk('a')).toBe(sdkA)
    expect(getSdk('b')).toBe(sdkB)

    unregisterSdk('a')

    expect(getSdk('a')).toBeUndefined()
    expect(getSdk('b')).toBe(sdkB)
  })
})

describe('bridge registry', () => {
  it('registerBridge and connectBridges calls connect on registered bridges', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const connectSpy = jasmine.createSpy('connect')

    registerBridge('test-bridge', { connect: connectSpy })
    connectBridges(pipeline)

    expect(connectSpy).toHaveBeenCalledWith(pipeline)
  })

  it('connectBridges calls connect on all registered bridges', () => {
    const pipeline = new Pipeline<Record<string, unknown>>()
    const connectA = jasmine.createSpy('connectA')
    const connectB = jasmine.createSpy('connectB')

    registerBridge('bridge-a', { connect: connectA })
    registerBridge('bridge-b', { connect: connectB })
    connectBridges(pipeline)

    expect(connectA).toHaveBeenCalledWith(pipeline)
    expect(connectB).toHaveBeenCalledWith(pipeline)
  })
})
