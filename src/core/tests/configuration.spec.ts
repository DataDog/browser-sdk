import { expect } from 'chai'

import { buildConfiguration } from '../configuration'

describe('configuration module', () => {
  const apiKey = 'some_api_key'

  it('build the configuration correct log endpoint', () => {
    let configuration = buildConfiguration({ apiKey })
    expect(configuration.logsEndpoint).includes(apiKey)

    // TO KISS we check that logs and monitoring endpoints can NOT be overidden with the regular bundle
    // (a.k.a not "e2e-test"). It's not ideal since we don't test the other behavior but there's no easy way to
    // mock the `buildEnv` since it's provided by Webpack and having an extra series of tests on the other bundle
    // seems overkill given the few lines of code involved.
    const endpoint = 'bbbbbbbbbbbbbbb'
    configuration = buildConfiguration({ apiKey, logsEndpoint: endpoint, monitoringEndpoint: endpoint })
    expect(configuration.logsEndpoint).not.equal(endpoint)
    expect(configuration.monitoringEndpoint).not.equal(endpoint)
  })

  it('build the configuration correct monitoring endpoint', () => {
    let configuration = buildConfiguration({ apiKey })
    expect(configuration.monitoringEndpoint).undefined

    configuration = buildConfiguration({ apiKey, monitoringApiKey: apiKey })
    expect(configuration.monitoringEndpoint).includes(apiKey)
  })

  it('build the configuration isCollectingError', () => {
    let configuration = buildConfiguration({ apiKey })
    expect(configuration.isCollectingError).true

    configuration = buildConfiguration({ apiKey, isCollectingError: false })
    expect(configuration.isCollectingError).false
  })
})
