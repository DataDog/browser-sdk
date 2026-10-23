import { noop } from '@datadog/js-core/util'
import { createSoftNavigationEntryFilter } from './softNavigationEntryFilter'

describe('createSoftNavigationEntryFilter', () => {
  it('should accept every entry until the navigationId is set', () => {
    const filter = createSoftNavigationEntryFilter(true)

    expect(filter.accept({ navigationId: 1 })).toBeTrue()
    expect(filter.accept({ navigationId: 2 })).toBeTrue()
  })

  it('should only accept entries from the soft navigation onward once the navigationId is set', () => {
    const filter = createSoftNavigationEntryFilter(true)
    filter.setNavigationId(2, noop)

    expect(filter.accept({ navigationId: 1 })).toBeFalse()
    expect(filter.accept({ navigationId: 2 })).toBeTrue()
    expect(filter.accept({ navigationId: 3 })).toBeTrue()
  })

  it('should recompute from the accepted entries of the soft navigation onward', () => {
    const filter = createSoftNavigationEntryFilter(true)
    const recompute = jasmine.createSpy()
    const previousNavigationEntry = { navigationId: 1 }
    const softNavigationEntry = { navigationId: 2 }
    const nextNavigationEntry = { navigationId: 3 }
    filter.accept(previousNavigationEntry)
    filter.accept(softNavigationEntry)
    filter.accept(nextNavigationEntry)

    filter.setNavigationId(2, recompute)

    expect(recompute).toHaveBeenCalledOnceWith([softNavigationEntry, nextNavigationEntry])
  })

  it('should recompute from no entries when every accepted entry is from before the soft navigation', () => {
    const filter = createSoftNavigationEntryFilter(true)
    const recompute = jasmine.createSpy()
    filter.accept({ navigationId: 1 })
    filter.accept({ navigationId: 1 })

    filter.setNavigationId(2, recompute)

    expect(recompute).toHaveBeenCalledOnceWith([])
  })

  it('should not recompute when every accepted entry is from the soft navigation onward', () => {
    const filter = createSoftNavigationEntryFilter(true)
    const recompute = jasmine.createSpy()
    filter.accept({ navigationId: 2 })
    filter.accept({ navigationId: 3 })

    filter.setNavigationId(2, recompute)

    expect(recompute).not.toHaveBeenCalled()
  })

  it('should accept entries without navigationId', () => {
    const filter = createSoftNavigationEntryFilter(true)
    filter.setNavigationId(2, noop)

    expect(filter.accept({})).toBeTrue()
  })

  it('should neither filter nor recompute when soft navigation is not tracked', () => {
    const filter = createSoftNavigationEntryFilter(false)
    const recompute = jasmine.createSpy()
    filter.accept({ navigationId: 1 })
    filter.accept({ navigationId: 2 })

    filter.setNavigationId(2, recompute)

    expect(recompute).not.toHaveBeenCalled()
    expect(filter.accept({ navigationId: 1 })).toBeTrue()
  })
})
