import { test } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'

export type Tag = 'skip' | 'fixme'

export function addTag(name: Tag, value: string) {
  test.info().annotations.push({
    type: `dd_tags[test.${name}]`,
    description: value,
  })
}

export function addBrowserConfigurationTags(metadata: BrowserConfiguration | Record<any, never>) {
  // eslint-disable-next-line prefer-const
  for (let [tag, value] of Object.entries(metadata)) {
    if (tag === 'name') {
      tag = 'browser'
    } else if (tag === 'version') {
      tag = 'browserVersion'
    }

    addTag(tag as Tag, value)
  }
}
