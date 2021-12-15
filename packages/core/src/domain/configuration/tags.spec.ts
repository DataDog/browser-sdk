import { display } from '../../tools/display'
import { InitConfiguration } from './configuration'
import { buildTag, buildTags, TAG_SIZE_LIMIT } from './tags'

const LARGE_VALUE = Array(TAG_SIZE_LIMIT + 10).join('a')

describe('buildTags', () => {
  it('build tags from init configuration', () => {
    expect(
      buildTags({
        service: 'foo',
        env: 'bar',
        version: 'baz',
      } as InitConfiguration)
    ).toEqual(['env:bar', 'service:foo', 'version:baz'])
  })
})

describe('buildTag', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    displaySpy = spyOn(display, 'warn')
  })

  it('lowercases tags', () => {
    expect(buildTag('env', 'BaR')).toBe('env:bar')
    expectWarning()
  })

  it('trims large tags', () => {
    const tag = buildTag('env', LARGE_VALUE)
    expect(tag.length).toBe(TAG_SIZE_LIMIT)
    expect(tag).toBe(`env:${LARGE_VALUE.slice(0, TAG_SIZE_LIMIT - 4)}`)
    expectWarning()
  })

  it('replaces forbidden characters with slashes', () => {
    expect(buildTag('env', 'b#r')).toBe('env:b_r')
    expectWarning()
  })

  function expectWarning() {
    expect(displaySpy).toHaveBeenCalledOnceWith("env value doesn't meet tag requirements and will be sanitized")
  }
})
