export const enum CustomerDataType {
  FeatureFlag,
  User,
  GlobalContext,
  View,
  Account,
}

// We want to use a real enum (i.e. not a const enum) to avoid inlining the enum values in the bundle and save bytes
// eslint-disable-next-line no-restricted-syntax
export enum CustomerContextKey {
  userContext = 'userContext',
  globalContext = 'globalContext',
  accountContext = 'accountContext',
}

// We want to use a real enum (i.e. not a const enum) to avoid inlining the enum values in the bundle and save bytes
// eslint-disable-next-line no-restricted-syntax
export enum ContextManagerMethod {
  getContext = 'getContext',
  setContext = 'setContext',
  setContextProperty = 'setContextProperty',
  removeContextProperty = 'removeContextProperty',
  clearContext = 'clearContext',
}
