import type { PlaywrightWorkerOptions, TestInfo } from '@playwright/test'
import type { BrowserConfiguration } from '../../../browsers.conf'

export function builDdTags(
  browserName: PlaywrightWorkerOptions['browserName'],
  metadata: BrowserConfiguration | Record<any, never>
) {
  const tags: TestInfo['annotations'] = [
    {
      type: 'dd_tags[test.browserName]',
      description: browserName,
    },
  ]

  for (let [tag, value] of Object.entries(metadata)) {
    if (tag === 'name') {
      tag = 'browser'
    } else if (tag === 'version') {
      tag = 'browserVersion'
    }

    tags.push({
      type: `dd_tags[test.${tag}]`,
      description: value,
    })
  }

  return tags
}
