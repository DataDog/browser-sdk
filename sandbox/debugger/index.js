import { onEntry, onReturn, onThrow } from './api.js'

if (typeof globalThis !== 'undefined') {
  globalThis.$dd_entry = onEntry
  globalThis.$dd_return = onReturn
  globalThis.$dd_throw = onThrow
}
