import EventEmitter from 'node:events'
import type http from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage, TestRunOptions } from './types/messages'

interface TestRunnerEventMap {
  connection: [Connection]
}

export class TestRunner extends EventEmitter<TestRunnerEventMap> {
  constructor(httpServer: http.Server) {
    super()
    const wss = new WebSocketServer({ server: httpServer })

    wss.on('connection', (ws) => {
      this.emit('connection', new Connection(ws))
    })
  }
}

interface ConnectionEventMap {
  'jasmine-started': [jasmine.JasmineStartedInfo]
  'spec-started': [jasmine.SpecResult]
  'spec-done': [jasmine.SpecResult]
  'suite-started': [jasmine.SuiteResult]
  'suite-done': [jasmine.SuiteResult]
  'jasmine-done': [jasmine.JasmineDoneInfo]
  close: []
  error: [Error]
}

export interface TestRunResults {
  specResults: jasmine.SpecResult[]
  suitesResults: jasmine.SuiteResult[]
  overallResult: jasmine.JasmineDoneInfo
}

export class Connection extends EventEmitter<ConnectionEventMap> {
  private ws: WebSocket
  constructor(ws: WebSocket) {
    super()

    this.ws = ws

    ws.on('message', (data) => {
      let message: ClientMessage

      if (!Buffer.isBuffer(data)) {
        this.emit('error', new Error('Error while parsing message from browser: not a buffer'))
        return
      }

      try {
        message = JSON.parse(data.toString())
      } catch (error) {
        this.emit('error', new Error('Error while parsing message from browser', { cause: error }))
        return
      }

      this.emit(
        message.type,
        message.data as any // We know incoming messages are associated with the correct payload
      )
    })
  }

  run(options: TestRunOptions): Promise<TestRunResults> {
    return new Promise((resolve, reject) => {
      const specResults: jasmine.SpecResult[] = []
      const suitesResults: jasmine.SuiteResult[] = []
      const onError = (error: any) => {
        cleanup()
        reject(new Error('Test run error', { cause: error }))
      }
      const onClose = () => {
        cleanup()
        reject(new Error('Test run error: connection closed'))
      }
      const onSpecDone = (specResult: jasmine.SpecResult) => {
        specResults.push(specResult)
      }
      const onSuiteDone = (suiteResult: jasmine.SuiteResult) => {
        suitesResults.push(suiteResult)
      }
      const onJasmineDone = (result: jasmine.JasmineDoneInfo) => {
        cleanup()
        resolve({
          specResults,
          suitesResults,
          overallResult: result,
        })
      }
      const cleanup = () => {
        this.off('error', onError)
        this.off('close', onClose)
        this.off('spec-done', onSpecDone)
        this.off('suite-done', onSuiteDone)
        this.off('jasmine-done', onJasmineDone)
      }
      this.on('error', onError)
      this.on('close', onClose)
      this.on('spec-done', onSpecDone)
      this.on('suite-done', onSuiteDone)
      this.on('jasmine-done', onJasmineDone)
      this.send({
        type: 'run-tests',
        data: options,
      })
    })
  }

  private send(message: ServerMessage) {
    this.ws.send(JSON.stringify(message))
  }
}
