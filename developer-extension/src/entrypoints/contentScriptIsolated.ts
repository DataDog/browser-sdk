import { defineContentScript } from 'wxt/utils/define-content-script'
import { main } from '../content-scripts/isolated'

// eslint-disable-next-line import/no-default-export
export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'ISOLATED',
  main,
})
