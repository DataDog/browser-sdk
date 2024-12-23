import { getSiteShortName } from './intakeSites'

describe('getSiteShortName', () => {
  it('should return "us1" by default', () => {
    expect(getSiteShortName(undefined)).toBe('us1')
  })

  it('should return "staging" for staging site', () => {
    expect(getSiteShortName('staging.datadoghq.com')).toBe('staging')
  })

  it('should return the inferred short name from subdomain-based site', () => {
    expect(getSiteShortName('us3.datadoghq.com')).toBe('us3')
    expect(getSiteShortName('ap1.datadoghq.com')).toBe('ap1')
  })

  it('should return short name for non subdomain-based site', () => {
    expect(getSiteShortName('datadoghq.com')).toBe('us1')
    expect(getSiteShortName('datadoghq.eu')).toBe('eu1')
    expect(getSiteShortName('ddog-gov.com')).toBe('us1-fed')
  })
})
