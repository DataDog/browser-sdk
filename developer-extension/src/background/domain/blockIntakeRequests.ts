import { intakeUrlPatterns } from '../intakeUrlPatterns'
import { store } from '../store'

chrome.webRequest.onBeforeRequest.addListener(
  () => {
    if (!store.blockIntakeRequests) {
      return
    }
    return { cancel: true }
  },
  {
    urls: intakeUrlPatterns,
  },
  ['blocking']
)
