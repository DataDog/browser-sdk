import type { Module } from '@datadog/core-next'
import { loadModules, MODULE_MAP } from './moduleLoader'

function stubModule(name: string): Module {
  return {
    name,
    extension: {
      key: name,
      validate: (init: unknown) => init ?? null,
    },
    init: jasmine.createSpy('init').and.returnValue({}),
  }
}

describe('loadModules', () => {
  it('returns explicit modules unchanged when no config keys match MODULE_MAP', async () => {
    const rum = stubModule('rum')
    const result = await loadModules(['clientToken', 'site', 'env'], [rum])

    expect(result).toEqual([rum])
  })

  it('skips config keys that already have explicit modules by name', async () => {
    const rum = stubModule('rum')
    // 'rum' is in MODULE_MAP but also in explicitModules — should not attempt dynamic import
    const warnSpy = spyOn(console, 'warn')
    const result = await loadModules(['rum'], [rum])

    expect(result).toEqual([rum])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('skips config keys not in MODULE_MAP', async () => {
    const warnSpy = spyOn(console, 'warn')
    const result = await loadModules(['clientToken', 'site', 'env', 'sessionSampleRate'])

    expect(result).toEqual([])
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns on failed dynamic import', async () => {
    // MODULE_MAP points to non-existent packages, so import() will fail in Karma
    const warnSpy = spyOn(console, 'warn')

    // Use a key that is in MODULE_MAP so the import is attempted
    await loadModules(['rum'])

    expect(warnSpy).toHaveBeenCalledWith('Failed to load module "rum"')
  })

  it('combines explicit modules with any dynamically loaded ones', async () => {
    const logs = stubModule('logs')
    const warnSpy = spyOn(console, 'warn')

    // 'rum' will fail to load (non-existent package), 'logs' is explicit
    const result = await loadModules(['rum', 'logs'], [logs])

    // explicit module is always returned
    expect(result).toContain(logs)
    // warn fired for the failed dynamic import of 'rum'
    expect(warnSpy).toHaveBeenCalledWith('Failed to load module "rum"')
  })

  it('MODULE_MAP contains rum and logs keys', () => {
    expect(MODULE_MAP['rum']).toBeDefined()
    expect(MODULE_MAP['logs']).toBeDefined()
  })
})
