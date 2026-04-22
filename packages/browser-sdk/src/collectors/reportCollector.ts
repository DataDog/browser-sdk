import type { Pipeline, ReportResource } from '@datadog/core-next'

function startReportCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  if (typeof ReportingObserver === 'undefined') {
    return () => {}
  }

  const observer = new ReportingObserver((reports) => {
    for (const report of reports) {
      const resource: ReportResource = {
        type: report.type,
        message: report.body ? ((report.body as any).message ?? report.type) : report.type,
        subtype: report.body ? (report.body as any).id : undefined,
      }
      pipeline.publish('resource:report', resource)
    }
  })

  observer.observe()

  return () => {
    observer.disconnect()
  }
}

export { startReportCollection }
