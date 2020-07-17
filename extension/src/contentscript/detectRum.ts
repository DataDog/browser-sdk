const RUM_SDK_ON = 'rum-sdk-on'
const ROOT_TAG: HTMLCollection | null = document.getElementsByTagName('html')

/**
 * Inject the checkSDK script into the page body
 */
const injectScript = (file, node) => {
  const th = document.getElementsByTagName(node)[0]
  const s = document.createElement('script')
  s.setAttribute('type', 'text/javascript')
  s.setAttribute('src', file)
  th.appendChild(s)
}
injectScript(chrome.extension.getURL('/assets/checkSDK.js'), 'body')

ROOT_TAG[0].addEventListener(RUM_SDK_ON, () => {
  chrome.runtime.sendMessage({ type: 'enableExtension' })
})
