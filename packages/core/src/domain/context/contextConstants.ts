export const enum CustomerDataType {
  FeatureFlag,
  User,
  GlobalContext,
  View,
  Account,
}

// Use a const instead of const enum to avoid inlining the enum values in the bundle and save bytes
export const CustomerContextKey = {
  userContext: 'userContext',
  globalContext: 'globalContext',
  accountContext: 'accountContext',
} as const

export type CustomerContextKey = (typeof CustomerContextKey)[keyof typeof CustomerContextKey]

// Use a const instead of const enum to avoid inlining the enum values in the bundle and save bytes
export const ContextManagerMethod = {
  getContext: 'getContext',
  setContext: 'setContext',
  setContextProperty: 'setContextProperty',
  removeContextProperty: 'removeContextProperty',
  clearContext: 'clearContext',
} as const

export type ContextManagerMethod = (typeof ContextManagerMethod)[keyof typeof ContextManagerMethod]
