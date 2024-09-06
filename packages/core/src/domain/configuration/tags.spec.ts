import { display } from '../../tools/display'
import type { InitConfiguration } from './configuration'
import { buildTag, buildTags, supportUnicodePropertyEscapes, TAG_SIZE_LIMIT } from './tags'

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

describe('buildTag warning', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    if (!supportUnicodePropertyEscapes()) {
      pending('UNicode property escapes are not supported')
    }

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

  it('shows a warning when using non latin uppercase letters like in Greek', () => {
    buildTag('env', 'Δοκιμή')
    expectWarning()
  })

  it('do not shows a warning when non latin characters are neither uppercase or lowercase (p{Lo}) like Japanese', () => {
    buildTag('env', 'てすと')
    expect(displaySpy).not.toHaveBeenCalled()
  })

  it('forbids to craft multiple tags by passing a value with a comma', () => {
    expect(buildTag('env', 'foo,bar')).toBe('env:foo_bar')
    expectWarning()
  })

  function expectWarning() {
    expect(displaySpy).toHaveBeenCalledOnceWith(
      jasmine.stringContaining("env value doesn't meet tag requirements and will be sanitized")
    )
  }
})
