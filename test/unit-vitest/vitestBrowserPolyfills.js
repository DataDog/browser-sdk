;(function installVitestBrowserPolyfills() {
  'use strict'

  const MAX_SAFE_INTEGER = 0x1fffffffffffff

  function toIntegerOrInfinity(value) {
    const numericValue = Number(value)
    if (numericValue === 0 || numericValue !== numericValue) {
      return 0
    }
    return numericValue < 0 ? Math.ceil(numericValue) : Math.floor(numericValue)
  }

  function toLength(value) {
    return Math.min(Math.max(toIntegerOrInfinity(value), 0), MAX_SAFE_INTEGER)
  }

  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function hasOwn(object, property) {
        return Object.prototype.hasOwnProperty.call(object, property)
      },
    })
  }

  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function at(index) {
        if (this === null || this === undefined) {
          throw new TypeError('Array.prototype.at called on null or undefined')
        }

        const object = Object(this)
        const length = toLength(object.length)
        const relativeIndex = toIntegerOrInfinity(index)
        const actualIndex = relativeIndex >= 0 ? relativeIndex : length + relativeIndex
        return actualIndex < 0 || actualIndex >= length ? undefined : object[actualIndex]
      },
    })
  }

  if (typeof Array.prototype.findLastIndex !== 'function') {
    Object.defineProperty(Array.prototype, 'findLastIndex', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function findLastIndex(predicate, thisArg) {
        if (this === null || this === undefined) {
          throw new TypeError('Array.prototype.findLastIndex called on null or undefined')
        }
        if (typeof predicate !== 'function') {
          throw new TypeError('predicate must be a function')
        }

        const object = Object(this)
        const length = toLength(object.length)
        for (let index = length - 1; index >= 0; index -= 1) {
          if (predicate.call(thisArg, object[index], index, object)) {
            return index
          }
        }
        return -1
      },
    })
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function randomUUID() {
        const bytes = crypto.getRandomValues(new Uint8Array(16))
        bytes[6] = (bytes[6] % 0x10) + 0x40
        bytes[8] = (bytes[8] % 0x40) + 0x80

        let hex = ''
        for (const byte of bytes) {
          hex += byte.toString(16).padStart(2, '0')
        }
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      },
    })
  }

  // Safari < 15.4. Vitest's orchestrator and tester iframes are same-origin, so channels can share
  // a registry stored on the top window.
  if (typeof BroadcastChannel === 'undefined') {
    let registry
    try {
      registry = globalThis.top.__broadcastChannelRegistry__ || (globalThis.top.__broadcastChannelRegistry__ = {})
    } catch {
      registry = {}
    }

    class BroadcastChannelPolyfill {
      constructor(name) {
        this.name = String(name)
        this.onmessage = null
        this.listeners = []
        this.closed = false
        ;(registry[this.name] || (registry[this.name] = [])).push(this)
      }

      postMessage(data) {
        if (this.closed) {
          throw new Error('BroadcastChannel is closed')
        }
        const recipients = (registry[this.name] || []).filter((channel) => channel !== this)
        setTimeout(() => {
          recipients.forEach((channel) => {
            if (!channel.closed) {
              try {
                channel.dispatch(data)
              } catch {
                // The recipient frame may have been removed
              }
            }
          })
        })
      }

      dispatch(data) {
        const event = new MessageEvent('message', { data })
        if (typeof this.onmessage === 'function') {
          this.onmessage(event)
        }
        this.listeners.slice().forEach((listener) => listener.call(this, event))
      }

      addEventListener(type, listener) {
        if (type === 'message') {
          this.listeners.push(listener)
        }
      }

      removeEventListener(_type, listener) {
        this.listeners = this.listeners.filter((l) => l !== listener)
      }

      close() {
        this.closed = true
        const channels = registry[this.name] || []
        const index = channels.indexOf(this)
        if (index !== -1) {
          channels.splice(index, 1)
        }
      }
    }

    globalThis.BroadcastChannel = BroadcastChannelPolyfill
  }

  // Firefox < 79. Vitest uses it to report multiple errors.
  if (typeof AggregateError === 'undefined') {
    class AggregateErrorPolyfill extends Error {
      constructor(errors, message) {
        super(message)
        this.name = 'AggregateError'
        this.errors = Array.from(errors)
      }
    }

    globalThis.AggregateError = AggregateErrorPolyfill
  }
})()
