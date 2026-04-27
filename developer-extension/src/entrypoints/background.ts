import { defineBackground } from 'wxt/utils/define-background'

// eslint-disable-next-line import/no-default-export
export default defineBackground(() => {
  void import('../background')
})
