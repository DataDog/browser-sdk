import { RawError } from '../../tools/error'
import { Observable } from '../../tools/observable'
import { Configuration } from '../configuration'
import { trackConsoleError } from './trackConsoleError'
import { trackRuntimeError } from './trackRuntimeError'
import { trackNetworkError } from './trackNetworkError'

export type ErrorObservable = Observable<RawError>
let errorObservable: ErrorObservable

export function startAutomaticErrorCollection(configuration: Configuration) {
  if (!errorObservable) {
    errorObservable = new Observable<RawError>()
    trackNetworkError(configuration, errorObservable)
    trackConsoleError(errorObservable)
    trackRuntimeError(errorObservable)
  }
  return errorObservable
}
