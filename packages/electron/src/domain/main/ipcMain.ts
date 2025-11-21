import type { IpcMain } from 'electron'
import { ipcMain } from 'electron'
import tracer from '../trace/tracer'
import type { DatadogCarrier } from '../trace/trace'

const SPAN_NAME_PREFIX = 'ipcMain'

const isDatadogCarrier = (arg: any): arg is DatadogCarrier => typeof arg === 'object' && arg?.__dd_carrier === true

export function createIpcMain(): IpcMain {
  const ddIpcMain = { ...ipcMain }

  ddIpcMain.on = withDatadogCarrier('on', ipcMain.on.bind(ipcMain))
  ddIpcMain.off = withDatadogCarrier('off', ipcMain.off.bind(ipcMain))
  ddIpcMain.once = withDatadogCarrier('once', ipcMain.once.bind(ipcMain))
  ddIpcMain.addListener = withDatadogCarrier('addListener', ipcMain.addListener.bind(ipcMain))
  ddIpcMain.removeListener = withDatadogCarrier('removeListener', ipcMain.removeListener.bind(ipcMain))
  ddIpcMain.handle = withDatadogCarrier('handle', ipcMain.handle.bind(ipcMain))
  ddIpcMain.handleOnce = withDatadogCarrier('handleOnce', ipcMain.handleOnce.bind(ipcMain))

  ddIpcMain.removeAllListeners = ipcMain.removeAllListeners.bind(ipcMain)
  ddIpcMain.removeHandler = ipcMain.removeHandler.bind(ipcMain)

  return ddIpcMain
}

function withDatadogCarrier<T extends (...args: any[]) => R, R>(name: string, fn: T): (...args: Parameters<T>) => R {
  return (...args: Parameters<T>) => {
    const channel = args[0]
    const listener = args[1] as (...args: any[]) => R
    const spanName = `${SPAN_NAME_PREFIX}.${name}.${channel}`

    return fn(channel, (...args: Parameters<typeof listener>) => {
      const lastArg = args[args.length - 1]
      if (isDatadogCarrier(lastArg)) {
        const parentContext = tracer.extract('text_map', lastArg)
        args.pop() // remove the carrier from the args

        if (parentContext) {
          return tracer.trace(spanName, { childOf: parentContext }, () => listener(...args))
        }
      }

      return tracer.trace(spanName, () => listener(...args))
    })
  }
}
