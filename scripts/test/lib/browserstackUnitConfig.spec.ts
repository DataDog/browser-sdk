import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getBrowserStackCapabilities, getBrowserStackInstance } from './browserstackUnitConfig.ts'

const options = {
  username: 'user',
  accessKey: 'key',
  localIdentifier: 'local',
  build: 'build',
  playwrightVersion: '1.59.1',
}

describe('BrowserStack unit configuration', () => {
  it('maps branded desktop browsers to Chromium with an explicit version', () => {
    const capabilities = getBrowserStackCapabilities(
      {
        sessionName: 'Edge',
        name: 'edge',
        version: '88.0',
        os: 'Windows',
        osVersion: '11',
      },
      options
    )

    const instance = getBrowserStackInstance(
      {
        sessionName: 'Edge',
        name: 'edge',
        version: '88.0',
        os: 'Windows',
        osVersion: '11',
      },
      options
    )
    assert.equal(instance.browser, 'chromium')
    assert.equal(capabilities.browser_version, '88.0')
    assert.equal(capabilities['browserstack.playwrightVersion'], undefined)
    assert.equal(capabilities['client.playwrightVersion'], '1.59.1')
  })

  it('uses BrowserStack bundled-browser capabilities for Firefox and WebKit', () => {
    const capabilities = getBrowserStackCapabilities(
      {
        sessionName: 'Firefox',
        name: 'playwright-firefox',
        os: 'Windows',
        osVersion: '11',
      },
      options
    )

    const firefoxInstance = getBrowserStackInstance(
      {
        sessionName: 'Firefox',
        name: 'playwright-firefox',
        os: 'Windows',
        osVersion: '11',
      },
      options
    )
    const webkitInstance = getBrowserStackInstance(
      {
        sessionName: 'WebKit',
        name: 'playwright-webkit',
        os: 'OS X',
        osVersion: 'Sequoia',
      },
      options
    )
    assert.equal(firefoxInstance.browser, 'chromium')
    assert.equal(webkitInstance.browser, 'chromium')
    assert.equal(capabilities.browser_version, undefined)
    assert.equal(capabilities['browserstack.playwrightVersion'], '1.59.1')
  })

  it('configures the remote connection on the instance provider', () => {
    const instance = getBrowserStackInstance(
      {
        sessionName: 'Firefox',
        name: 'playwright-firefox',
        os: 'Windows',
        osVersion: '11',
      },
      options
    )

    assert.equal(instance.browser, 'chromium')
    assert.equal(instance.name, 'Firefox')
    assert.equal(instance.provider.name, 'playwright')
    assert.equal('playwright' in instance, false)

    const wsEndpoint = instance.provider.options.connectOptions?.wsEndpoint
    assert.ok(wsEndpoint)
    const capabilities = JSON.parse(new URL(wsEndpoint).searchParams.get('caps')!) as Record<string, string>
    assert.equal(capabilities.browser, 'playwright-firefox')
    assert.equal(capabilities['browserstack.playwrightVersion'], '1.59.1')
  })
})
