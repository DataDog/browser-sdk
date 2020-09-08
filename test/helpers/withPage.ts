import { ServerEvent } from '../e2e/scenario/serverTypes'
// tslint:disable-next-line: no-empty
const noop = () => {}

export function withPage({
  html,
  onLoad = noop,
  onUnload = noop,
}: {
  html: string
  onLoad?(window: Window, events: ServerEvent[]): void
  onUnload?(window: Window, events: ServerEvent[]): void
}) {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)

  const events: ServerEvent[] = []

  const iframeWindow = iframe.contentWindow!
  const iframeDocument = iframeWindow.document
  iframeDocument.open()

  iframeWindow.addEventListener('transport-message', (event: unknown) => {
    const message = (event as { detail: { message: ServerEvent } }).detail.message
    events.push(message)
  })

  iframeWindow.addEventListener('load', () => {
    // Run assertions asynchronously so events sent on 'load' are taken into account
    setTimeout(() => {
      onLoad(iframeWindow, events)
      // Reload the page to trigger events sent at page unload
      iframe.src = iframe.src
    })
  })

  iframeWindow.addEventListener('unload', () => {
    // Run assertions asynchronously so events sent on 'unload' are taken into account
    setTimeout(() => {
      onUnload(iframeWindow, events)
      document.body.removeChild(iframe)
    })
  })

  iframeDocument.write(html)
  iframeDocument.close()
}
