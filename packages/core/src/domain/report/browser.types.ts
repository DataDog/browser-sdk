export interface BrowserWindow {
  ReportingObserver?: ReportingObserverConstructor
}

export interface ReportingObserver {
  disconnect(): void
  observe(): void
  takeRecords(): Report[]
}

export interface ReportingObserverConstructor {
  new (callback: ReportingObserverCallback, option: ReportingObserverOption): ReportingObserver
}

export type ReportType = 'intervention' | 'deprecation'

export interface Report {
  type: ReportType
  url: string
  body: DeprecationReportBody | InterventionReportBody
}

export interface ReportingObserverCallback {
  (reports: Report[], observer: ReportingObserver): void
}

export interface ReportingObserverOption {
  types: ReportType[]
  buffered: boolean
}

interface DeprecationReportBody {
  id: string
  message: string
  lineNumber: number
  columnNumber: number
  sourceFile: string
  anticipatedRemoval?: Date
}

interface InterventionReportBody {
  id: string
  message: string
  lineNumber: number
  columnNumber: number
  sourceFile: string
}
