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
  })

  it('trims large tags', () => {
    const tag = buildTag('env', LARGE_VALUE)
    expect(tag.length).toBe(TAG_SIZE_LIMIT)
    expect(tag).toBe(`env:${LARGE_VALUE.slice(0, TAG_SIZE_LIMIT - 4)}`)
    expect(displaySpy).toHaveBeenCalledOnceWith(
      `env value is too big and has been trimmed to ${LARGE_VALUE.slice(0, TAG_SIZE_LIMIT - 4)}`
    )
  })

  it('replaces forbidden characters with slashes', () => {
    expect(buildTag('env', 'b#r')).toBe('env:b_r')
    expect(displaySpy).toHaveBeenCalledOnceWith('env value contains forbidden characters and has been sanitized to b_r')
  })

  it('removes ending semicolons', () => {
    expect(buildTag('env', 'bar:::')).toBe('env:bar')
    expect(displaySpy).toHaveBeenCalledOnceWith('env value ends with invalid characters and has been sanitized to bar')
  })
})
