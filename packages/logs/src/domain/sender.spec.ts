import { display } from '@datadog/browser-core'
import type { LogsMessage } from './logger'
import { HandlerType, StatusType } from './logger'
import type { Sender } from './sender'
import { createSender } from './sender'

describe('Sender', () => {
  let sender: Sender
  let sendLogSpy: jasmine.Spy<(message: LogsMessage) => void>

  beforeEach(() => {
    sendLogSpy = jasmine.createSpy()
    sender = createSender(sendLogSpy)
    spyOn(display, 'log')
  })

  describe('sendLog', () => {
    it('should send to http by default', () => {
      sender.sendLog('message')

      expect(sendLogSpy).toHaveBeenCalled()
      expect(display.log).not.toHaveBeenCalled()
    })

    it('should send to http and console when both handlers are enabled', () => {
      sender.setHandler([HandlerType.http, HandlerType.console])
      sender.sendLog('message')

      expect(sendLogSpy).toHaveBeenCalled()
      expect(display.log).toHaveBeenCalled()
    })
  })

  describe('sendHttpRequest', () => {
    it('should only send to http', () => {
      sender.setHandler([HandlerType.http, HandlerType.console])
      sender.sendToHttp('message', {}, StatusType.info)

      expect(sendLogSpy).toHaveBeenCalled()
      expect(display.log).not.toHaveBeenCalled()
    })

    it('should not send to http when the handler is disabled', () => {
      sender.setHandler([HandlerType.console])
      sender.sendToHttp('message', {}, StatusType.info)

      expect(sendLogSpy).not.toHaveBeenCalled()
      expect(display.log).not.toHaveBeenCalled()
    })
  })
})
