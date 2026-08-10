import { createMockWebSocket, mockWebSocket, MockWebSocket, registerCleanupTask } from '../../test'
import type { Subscription } from '../tools/observable'
import { setAllowUntrustedEvents } from './addEventListener'
import type { WebSocketContext } from './webSocketObservable'
import { initWebSocketObservable, resetWebSocketObservable } from './webSocketObservable'

describe('webSocketObservable', () => {
  let contexts: WebSocketContext[]
  let subscription: Subscription | undefined

  beforeEach(() => {
    mockWebSocket()
    contexts = []

    registerCleanupTask(() => {
      subscription?.unsubscribe()
      subscription = undefined
      resetWebSocketObservable()
    })
  })

  function startTracking() {
    setAllowUntrustedEvents(true)
    subscription = initWebSocketObservable().subscribe((context) => {
      contexts.push(context)
    })
  }

  function getContexts<T extends WebSocketContext['state']>(state: T) {
    return contexts.filter((context): context is Extract<WebSocketContext, { state: T }> => context.state === state)
  }

  describe('when tracking is started', () => {
    beforeEach(() => {
      startTracking()
    })

    describe('connecting context', () => {
      it('emits a "connecting" context when a WebSocket is constructed', () => {
        const url = 'wss://example.com/socket'
        const ws = createMockWebSocket(url)

        const connectingContexts = getContexts('connecting')
        expect(connectingContexts.length).toBe(1)
        expect(connectingContexts[0].url).toBe(url)
        expect(connectingContexts[0].instance).toBe(ws as unknown as WebSocket)
        expect(connectingContexts[0].startClocks.timeStamp).toEqual(jasmine.any(Number))
      })

      it('reports the resolved instance.url rather than the raw constructor argument', () => {
        const ws = createMockWebSocket('/socket')

        const connectingContext = getContexts('connecting')[0]
        expect(connectingContext.url).not.toBe('/socket')
        expect(connectingContext.url).toBe(ws.url)
      })

      it('does not include protocols in the "connecting" context when omitted', () => {
        createMockWebSocket('wss://example.com/socket')

        expect(getContexts('connecting')[0].protocols).toBeUndefined()
      })

      it('includes string protocols in the "connecting" context', () => {
        const url = 'wss://example.com/socket'
        const protocols = 'chat.v1'
        createMockWebSocket(url, protocols)

        expect(getContexts('connecting')[0].protocols).toBe(protocols)
      })

      it('includes array protocols in the "connecting" context', () => {
        const url = 'wss://example.com/socket'
        const protocols = ['chat.v1', 'json']
        createMockWebSocket(url, protocols)

        expect(getContexts('connecting')[0].protocols).toEqual(protocols)
      })
    })

    describe('preservation of native behavior', () => {
      it('does not clobber a customer-set onmessage handler', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const customerHandler = jasmine.createSpy()
        ws.onmessage = customerHandler

        ws.simulateMessage('hello')

        expect(customerHandler).toHaveBeenCalledTimes(1)
        expect(getContexts('message-in').length).toBe(1)
      })

      it('does not clobber a customer-set onopen handler', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const customerHandler = jasmine.createSpy()
        ws.onopen = customerHandler

        ws.simulateOpen()

        expect(customerHandler).toHaveBeenCalledTimes(1)
        expect(getContexts('open').length).toBe(1)
      })

      it('does not clobber a customer-set onclose handler', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const customerHandler = jasmine.createSpy()
        ws.onclose = customerHandler

        ws.simulateClose(1000, 'bye', true)

        expect(customerHandler).toHaveBeenCalledTimes(1)
        expect(getContexts('closed').length).toBe(1)
      })
    })

    describe('open context', () => {
      it('emits an "open" context when the WebSocket opens', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const negotiatedProtocol = 'chat.v1'
        ws.protocol = negotiatedProtocol
        ws.simulateOpen()

        const openContexts = getContexts('open')
        expect(openContexts.length).toBe(1)
        expect(openContexts[0].protocol).toBe(negotiatedProtocol)
        expect(openContexts[0].instance).toBe(ws as unknown as WebSocket)
        expect(openContexts[0].openClocks.timeStamp).toEqual(jasmine.any(Number))
      })

      it('emits an "open" context with empty protocol when no sub-protocol negotiated', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()

        const openContexts = getContexts('open')
        expect(openContexts.length).toBe(1)
        expect(openContexts[0].protocol).toBe('')
      })
    })

    describe('message-in context', () => {
      it('emits "message-in" with byte-length size for string payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()
        const payload = 'hello world'
        ws.simulateMessage(payload)

        const messageInContexts = getContexts('message-in')
        expect(messageInContexts.length).toBe(1)
        expect(messageInContexts[0].size).toBe(payload.length)
      })

      it('emits "message-in" with UTF-8 byte length for multi-byte strings', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()
        // 'é' is 2 bytes in UTF-8 and 'あ' is 3 bytes; total is 5 bytes for 2 chars
        const payload = 'éあ'
        ws.simulateMessage(payload)

        expect(getContexts('message-in')[0].size).toBe(new TextEncoder().encode(payload).byteLength)
      })

      it('emits "message-in" with byteLength for ArrayBuffer payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()
        const byteLength = 16
        ws.simulateMessage(new ArrayBuffer(byteLength))

        expect(getContexts('message-in')[0].size).toBe(byteLength)
      })

      it('emits "message-in" with byteLength for ArrayBufferView payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()
        const viewByteLength = 12
        ws.simulateMessage(new Uint8Array(new ArrayBuffer(32), 4, viewByteLength))

        expect(getContexts('message-in')[0].size).toBe(viewByteLength)
      })

      it('emits "message-in" with size for Blob payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()
        const blob = new Blob(['hello'])
        ws.simulateMessage(blob)

        expect(getContexts('message-in')[0].size).toBe(blob.size)
      })
    })

    describe('message-out context', () => {
      it('emits "message-out" with size and bufferedAmountPreSend for string payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const bufferedAmountPreSend = 42
        ws.bufferedAmount = bufferedAmountPreSend
        const payload = 'hello'
        ws.send(payload)

        const messageOutContexts = getContexts('message-out')
        expect(messageOutContexts.length).toBe(1)
        expect(messageOutContexts[0].size).toBe(payload.length)
        expect(messageOutContexts[0].bufferedAmountPreSend).toBe(bufferedAmountPreSend)
        expect(messageOutContexts[0].at.timeStamp).toEqual(jasmine.any(Number))
      })

      it('emits "message-out" with byteLength for ArrayBuffer payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const byteLength = 8
        ws.send(new ArrayBuffer(byteLength))

        expect(getContexts('message-out')[0].size).toBe(byteLength)
      })

      it('emits "message-out" with byteLength for ArrayBufferView payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const viewByteLength = 10
        ws.send(new Uint8Array(new ArrayBuffer(20), 2, viewByteLength))

        expect(getContexts('message-out')[0].size).toBe(viewByteLength)
      })

      it('emits "message-out" with size for Blob payloads', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const blob = new Blob(['hello world'])
        ws.send(blob)

        expect(getContexts('message-out')[0].size).toBe(blob.size)
      })
    })

    describe('closed context', () => {
      it('emits a "closed" context with code, reason, and wasClean', () => {
        const ws = createMockWebSocket('wss://example.com/socket')
        const closeCode = 1000
        const closeReason = 'bye'
        const wasClean = true
        ws.simulateClose(closeCode, closeReason, wasClean)

        const closeContexts = getContexts('closed')
        expect(closeContexts.length).toBe(1)
        expect(closeContexts[0].code).toBe(closeCode)
        expect(closeContexts[0].reason).toBe(closeReason)
        expect(closeContexts[0].wasClean).toBe(wasClean)
        expect(closeContexts[0].at.timeStamp).toEqual(jasmine.any(Number))
      })
    })

    describe('subscription lifecycle', () => {
      it('restores the native WebSocket constructor when all subscribers unsubscribe', () => {
        subscription?.unsubscribe()
        subscription = undefined

        expect(window.WebSocket as unknown).toBe(MockWebSocket)
      })

      it('does not emit any further events after all subscribers unsubscribe', () => {
        subscription?.unsubscribe()
        subscription = undefined

        const ws = createMockWebSocket('wss://example.com/socket')
        ws.simulateOpen()
        ws.send('hello')

        expect(contexts.length).toBe(0)
      })
    })
  })
})
