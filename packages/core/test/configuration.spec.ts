import { buildConfiguration } from '../src/configuration'

describe('configuration module', () => {
  const clientToken = 'some_client_token'
  const version = 'some_version'

  it('build the configuration correct endpoints', () => {
    let configuration = buildConfiguration({ clientToken }, version)
    expect(configuration.logsEndpoint).toContain(clientToken)

    // TO KISS we check that rum and internal monitoring endpoints can NOT be overridden with the regular bundle
    // (a.k.a not "e2e-test"). It's not ideal since we don't test the other behavior but there's no easy way to
    // mock the `buildEnv` since it's provided by Webpack and having an extra series of tests on the other bundle
    // seems overkill given the few lines of code involved.
    const endpoint = 'bbbbbbbbbbbbbbb'
    configuration = buildConfiguration(
      { clientToken, rumEndpoint: endpoint, internalMonitoringEndpoint: endpoint },
      version
    )
    expect(configuration.rumEndpoint).not.toEqual(endpoint)
    expect(configuration.internalMonitoringEndpoint).not.toEqual(endpoint)
  })

  it('build the configuration correct monitoring endpoint', () => {
    let configuration = buildConfiguration({ clientToken }, version)
    expect(configuration.internalMonitoringEndpoint).toBeUndefined()

    configuration = buildConfiguration({ clientToken, internalMonitoringApiKey: clientToken }, version)
    expect(configuration.internalMonitoringEndpoint).toContain(clientToken)
  })

  it('build the configuration isCollectingError', () => {
    let configuration = buildConfiguration({ clientToken }, version)
    expect(configuration.isCollectingError).toEqual(true)

    configuration = buildConfiguration({ clientToken, isCollectingError: false }, version)
    expect(configuration.isCollectingError).toEqual(false)
  })
})
