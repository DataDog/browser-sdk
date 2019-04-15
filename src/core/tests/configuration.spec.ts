import { expect } from 'chai'

import { buildConfiguration } from '../configuration'

describe('configuration module', () => {
  const publicApiKey = 'some_api_key'

  it('build the configuration correct endpoints', () => {
    let configuration = buildConfiguration({ publicApiKey })
    expect(configuration.logsEndpoint).includes(publicApiKey)

    // TO KISS we check that rum and internal monitoring endpoints can NOT be overridden with the regular bundle
    // (a.k.a not "e2e-test"). It's not ideal since we don't test the other behavior but there's no easy way to
    // mock the `buildEnv` since it's provided by Webpack and having an extra series of tests on the other bundle
    // seems overkill given the few lines of code involved.
    const endpoint = 'bbbbbbbbbbbbbbb'
    configuration = buildConfiguration({ publicApiKey, rumEndpoint: endpoint, internalMonitoringEndpoint: endpoint })
    expect(configuration.rumEndpoint).not.equal(endpoint)
    expect(configuration.internalMonitoringEndpoint).not.equal(endpoint)
  })

  it('build the configuration correct monitoring endpoint', () => {
    let configuration = buildConfiguration({ publicApiKey })
    expect(configuration.internalMonitoringEndpoint).undefined

    configuration = buildConfiguration({ publicApiKey, internalMonitoringApiKey: publicApiKey })
    expect(configuration.internalMonitoringEndpoint).includes(publicApiKey)
  })

  it('build the configuration isCollectingError', () => {
    let configuration = buildConfiguration({ publicApiKey })
    expect(configuration.isCollectingError).true

    configuration = buildConfiguration({ publicApiKey, isCollectingError: false })
    expect(configuration.isCollectingError).false
  })
})
