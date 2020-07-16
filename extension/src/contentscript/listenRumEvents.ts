import { LifeCycleEventType, View } from '../lib/rumEvents'

const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')
const CUSTOM_EVENT_NAME = 'custom-rum-event'
const RUM_SDK_ON = 'rum-sdk-on'

interface CustomEventDetail {
  content: string
  date: number
  type: string
}

/**
 * Inject the checkSDK script into the page body
 */
const injectScript = (file, node) => {
    var th = document.getElementsByTagName(node)[0];
    var s = document.createElement('script');
    s.setAttribute('type', 'text/javascript');
    s.setAttribute('src', file);
    th.appendChild(s);
}
injectScript(chrome.extension.getURL('/assets/checkSDK.js'), 'body');

if (ROOT_TAG && ROOT_TAG.length) {
  ROOT_TAG[0].addEventListener(RUM_SDK_ON, () => {
    chrome.runtime.sendMessage({sdkEnabled: true});
    
    console.log('Waiting RUM events on:', ROOT_TAG, 'CUSTOM_EVENT_NAME:', CUSTOM_EVENT_NAME)
    ROOT_TAG[0].addEventListener(CUSTOM_EVENT_NAME, (customEvent: CustomEvent<CustomEventDetail>) => {
      if (
        customEvent.detail &&
        (customEvent.detail.type === LifeCycleEventType[LifeCycleEventType.VIEW_CREATED] ||
          customEvent.detail.type === LifeCycleEventType[LifeCycleEventType.VIEW_UPDATED])
      ) {
        const view: View = JSON.parse(customEvent.detail.content) as View
        console.log('Received View:', customEvent.detail.type, view)
      }
    })
  })
}
