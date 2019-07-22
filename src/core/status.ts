export enum StatusType {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
}

export type Status = keyof typeof StatusType

export const STATUS_PRIORITIES: { [key in StatusType]: number } = {
  [StatusType.debug]: 0,
  [StatusType.info]: 1,
  [StatusType.warn]: 2,
  [StatusType.error]: 3,
}

export const STATUSES = Object.keys(StatusType)
