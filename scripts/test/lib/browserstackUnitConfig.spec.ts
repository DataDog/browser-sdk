import assert from 'node:assert'
import { describe, it } from 'node:test'
import { getBrowserStackCapabilities, getPlaywrightBrowserName } from './browserstackUnitConfig.ts'

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

    assert.equal(getPlaywrightBrowserName('edge'), 'chromium')
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

    assert.equal(getPlaywrightBrowserName('playwright-firefox'), 'firefox')
    assert.equal(capabilities.browser_version, undefined)
    assert.equal(capabilities['browserstack.playwrightVersion'], '1.59.1')
    assert.equal(getPlaywrightBrowserName('playwright-webkit'), 'webkit')
  })

  it('uses Android device capabilities without desktop OS keys', () => {
    const capabilities = getBrowserStackCapabilities(
      {
        sessionName: 'Chrome mobile',
        name: 'chrome',
        os: 'android',
        osVersion: '13.0',
        device: 'Google Pixel 7 Pro',
      },
      options
    )

    assert.equal(capabilities.deviceName, 'Google Pixel 7 Pro')
    assert.equal(capabilities.osVersion, '13.0')
    assert.equal(capabilities.realMobile, 'true')
    assert.equal(capabilities.os, undefined)
    assert.equal(capabilities.os_version, undefined)
  })
})
