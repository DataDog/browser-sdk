import type { RumPlugin, OnRumStartOptions } from '../..'
import type { AddEvent, API } from './stream'
import { createStream } from './stream'

export function createStreamPlugin(): { plugin: RumPlugin; createStream: () => ReturnType<typeof createStream> } {
  let addEvent: OnRumStartOptions['addEvent']
  const callbacks = new Set<(addEvent: OnRumStartOptions['addEvent']) => void>()
  const store: AddEvent = (...args) => {
    callbacks.add(() => {
      addEvent!(...args)
    })
  }

  const api: API = {
    get addEvent() {
      return addEvent ?? store
    },
  }

  return {
    plugin: {
      name: 'stream',
      onRumStart: (options) => {
        addEvent = options.addEvent

        callbacks.forEach((callback) => callback(addEvent))
        callbacks.clear()
      },
    },
    createStream: () => createStream(api),
  }
}
