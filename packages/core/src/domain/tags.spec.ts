import { display } from '../tools/display'
import type { Configuration } from './configuration'
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
      } as Configuration)
    ).toEqual(['sdk_version:test', 'env:bar', 'service:foo', 'version:baz', 'datacenter:us1.prod.dog'])
  })
})

describe('buildTag warning', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    if (!supportUnicodePropertyEscapes()) {
      pending('Unicode property escapes are not supported')
    }

    displaySpy = spyOn(display, 'warn')
  })
  ;(
    [
      [(s: string) => buildTag(s), 'key only'],
      [(s: string) => buildTag(s, 'value'), 'tag key'],
      [(s: string) => buildTag('env', s), 'tag value'],
    ] as const
  ).forEach(([tagBuilder, description]) => {
    describe(description, () => {
      it('shows a warning when the tag contains uppercase letters', () => {
        tagBuilder('BaR')
        expectWarning()
      })

      it('shows a warning when the tag is too large', () => {
        tagBuilder(LARGE_VALUE)
        expectWarning()
      })

      it('shows a warning when the tag contains forbidden characters', () => {
        tagBuilder('b#r')
        expectWarning()
      })

      it('shows a warning when using non latin uppercase letters like in Greek', () => {
        tagBuilder('Δοκιμή')
        expectWarning()
      })

      it('do not shows a warning when non latin characters are neither uppercase or lowercase (p{Lo}) like Japanese', () => {
        tagBuilder('てすと')
        expect(displaySpy).not.toHaveBeenCalled()
      })

      it('forbids to craft multiple tags by passing a value with a comma', () => {
        expect(tagBuilder('foo,bar')).toContain('foo_bar')
        expectWarning()
      })
    })
  })

  function expectWarning() {
    expect(displaySpy).toHaveBeenCalledOnceWith(
      jasmine.stringMatching("Tag .* doesn't meet tag requirements and will be sanitized")
    )
  }
})
