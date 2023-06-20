export type ReportType = DeprecationReport['type'] | InterventionReport['type']

export interface DeprecationReport extends Report {
  type: 'deprecation'
  body: DeprecationReportBody
}
export interface DeprecationReportBody extends ReportBody {
  id: string
  message: string
  lineNumber: number | null
  columnNumber: number | null
  sourceFile: string | null
  anticipatedRemoval: Date | null
}

export interface InterventionReport extends Report {
  type: 'intervention'
  body: InterventionReportBody
}
export interface InterventionReportBody extends ReportBody {
  id: string
  message: string
  lineNumber: number | null
  columnNumber: number | null
  sourceFile: string | null
}
