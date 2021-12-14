import { InitConfiguration } from './configuration'
import { buildTags } from './tags'

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
