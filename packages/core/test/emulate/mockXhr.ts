import { isServerError, noop } from '../../src'
import { registerCleanupTask } from '../registerCleanupTask'
import { createNewEvent } from './createNewEvent'
import { MockEventTarget } from './mockEventTarget'

export function mockXhr() {
  const originalXhr = XMLHttpRequest

  window.XMLHttpRequest = MockXhr as any

  registerCleanupTask(() => {
    window.XMLHttpRequest = originalXhr
  })
}

export function withXhr({
  setup,
  onComplete,
}: {
  setup: (xhr: MockXhr) => void
  onComplete: (xhr: XMLHttpRequest) => void
}) {
  const xhr = new XMLHttpRequest()
  const loadend = () => {
    xhr.removeEventListener('loadend', loadend)
    setTimeout(() => {
      onComplete(xhr)
    })
  }
  xhr.addEventListener('loadend', loadend)
  setup(xhr as unknown as MockXhr)
}

export class MockXhr extends MockEventTarget {
  public static onSend: (xhr: MockXhr) => void | undefined
  public response: string | undefined = undefined
  public responseText: string | undefined = undefined
  public status: number | undefined = undefined
  public readyState: number = XMLHttpRequest.UNSENT
  public onreadystatechange: () => void = noop

  private hasEnded = false

  /* eslint-disable @typescript-eslint/no-unused-vars */
  open(method: string | undefined | null, url: string | URL | undefined | null) {
    this.hasEnded = false
  }

  send() {
    MockXhr.onSend?.(this)
  }

  abort() {
    this.status = 0
    if (this.hasEnded) {
      // Calling xhr.abort() on an ended request does not trigger events
      return
    }
    this.hasEnded = true
    this.readyState = XMLHttpRequest.DONE
    this.onreadystatechange()
    this.dispatchEvent(createNewEvent('abort'))
    this.dispatchEvent(createNewEvent('loadend'))
  }

  complete(status: number, response?: string) {
    if (this.hasEnded) {
      throw new Error("Can't call complete() on a ended request")
    }
    this.hasEnded = true
    this.response = response
    this.responseText = response
    this.status = status
    this.readyState = XMLHttpRequest.DONE

    this.onreadystatechange()

    if (status >= 200 && status < 500) {
      this.dispatchEvent(createNewEvent('load'))
    }
    if (isServerError(status)) {
      this.dispatchEvent(createNewEvent('error'))
    }
    this.dispatchEvent(createNewEvent('loadend'))
  }
}
