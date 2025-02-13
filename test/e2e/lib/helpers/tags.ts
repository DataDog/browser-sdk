import { test } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'

export function addTag(tag: string, value: string) {
  test.info().annotations.push({
    type: `dd_tags[${tag}]`,
    description: value,
  })
}

export function addBrowserConfigurationTags(metadata: BrowserConfiguration | Record<any, never>) {
  // eslint-disable-next-line prefer-const
  for (let [tag, value] of Object.entries(metadata)) {
    switch (tag) {
      case 'name':
        tag = 'test.browser.name'
        break
      case 'version':
        tag = 'test.browser.version'
        break
      case 'os':
        tag = 'os.platform'
        break
      case 'osVersion':
        tag = 'os.version'
        break
      case 'device':
        tag = 'device.name'
        break
      default:
        tag = `test.${tag}`
    }

    addTag(tag, value)
  }
}
