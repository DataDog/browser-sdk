import { Observable } from './observable'

export enum MessageType {
  error,
  request,
  performance,
  customEvent,
}

export enum ErrorOrigin {
  AGENT = 'agent',
  CONSOLE = 'console',
  NETWORK = 'network',
  SOURCE = 'source',
  LOGGER = 'logger',
}

export interface ErrorContext {
  kind?: string
  stack?: string
  origin: ErrorOrigin
}

export interface HttpContext {
  url: string
  status_code: number
  method: string
}

export interface ErrorMessage {
  type: MessageType.error
  message: string
  context: {
    error: ErrorContext
    http?: HttpContext
  }
}

export enum ResourceKind {
  XHR = 'xhr',
  BEACON = 'beacon',
  FETCH = 'fetch',
  CSS = 'css',
  JS = 'js',
  IMAGE = 'image',
  FONT = 'font',
  MEDIA = 'media',
  OTHER = 'other',
}

export enum RequestType {
  FETCH = ResourceKind.FETCH,
  XHR = ResourceKind.XHR,
}

export interface RequestMessage {
  type: MessageType.request
  requestType: RequestType
  method: string
  url: string
  status: number
  response?: string
  startTime: number
  duration: number
}

interface PerformanceMessage {
  type: MessageType.performance
  entry: PerformanceEntry
}

export interface Context {
  [x: string]: ContextValue
}

export type ContextValue = string | number | boolean | Context | ContextArray | undefined

export interface ContextArray extends Array<ContextValue> {}

export interface CustomEventMessage {
  type: MessageType.customEvent
  name: string
  context?: Context
}

export type Message = ErrorMessage | RequestMessage | PerformanceMessage | CustomEventMessage

export type MessageObservable = Observable<Message>
