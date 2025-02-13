import { test } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'

export function addTag(tag: string, value: string) {
  test.info().annotations.push({
    type: `dd_tags[${tag}]`,
    description: value,
  })
}

// Add test configuration tags used for test optimization features
// https://docs.datadoghq.com/tests/#test-configuration-attributes
export function addTestOptimizationTags(metadata: BrowserConfiguration | Record<any, never>) {
  // eslint-disable-next-line prefer-const
  for (let [tag, value] of Object.entries(metadata)) {
    switch (tag) {
      case 'name':
        tag = 'runtime.name'
        break
      case 'version':
        tag = 'runtime.version'
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
        // Note: Nested test.configuration tags, such as test.configuration.cpu.memory, are not supported.
        tag = `test.configuration.${tag}`
    }

    addTag(tag, value)
  }
}
