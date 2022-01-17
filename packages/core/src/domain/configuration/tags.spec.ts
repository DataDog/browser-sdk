import { display } from '../../tools/display'
import type { InitConfiguration } from './configuration'
import { buildTag, buildTags, TAG_SIZE_LIMIT } from './tags'

const LARGE_VALUE = Array(TAG_SIZE_LIMIT + 10).join('a')

describe('buildTags', () => {
  it('build tags from init configuration', () => {
    expect(
      buildTags({
        service: 'foo',
        env: 'bar',
        version: 'baz',
        datacenter: 'us1.prod.dog',
      } as InitConfiguration)
    ).toEqual(['env:bar', 'service:foo', 'version:baz', 'datacenter:us1.prod.dog'])
  })
})

describe('buildTag', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    displaySpy = spyOn(display, 'warn')
  })

  it('shows a warning when the tag contains uppercase letters', () => {
    buildTag('env', 'BaR')
    expectWarning()
  })

  it('shows a warning when the tag is too large', () => {
    buildTag('env', LARGE_VALUE)
    expectWarning()
  })

  it('shows a warning when the tag contains forbidden characters', () => {
    buildTag('env', 'b#r')
    expectWarning()
  })

  it('forbids to craft multiple tags by passing a value with a comma', () => {
    expect(buildTag('env', 'foo,bar')).toBe('env:foo_bar')
    expectWarning()
  })

  function expectWarning() {
    expect(displaySpy).toHaveBeenCalledOnceWith("env value doesn't meet tag requirements and will be sanitized")
  }
})
