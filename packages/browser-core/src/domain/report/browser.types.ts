export type ReportType = DeprecationReport['type'] | InterventionReport['type'] | DocumentPolicyViolationReport['type']

interface Report {
  type: ReportType
  url: string
  body: DeprecationReportBody | InterventionReportBody | DocumentPolicyViolationReportBody
  toJSON(): any
}

interface ReportBody {
  toJSON(): any
}

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

export interface DocumentPolicyViolationReport extends Report {
  type: 'document-policy-violation'
  body: DocumentPolicyViolationReportBody
}
export interface DocumentPolicyViolationReportBody extends ReportBody {
  featureId: string
  message: string
  disposition: 'enforce' | 'report'
  lineNumber: null
  columnNumber: null
  sourceFile: string | null
}
