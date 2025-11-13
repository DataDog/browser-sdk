import { useState } from 'react'
import { Trace, TracesData } from '../../types/data'
import { DATA_PATHS } from '../../utils/constants'
import { useData } from '../../hooks/useData'
import Flamegraph from './Flamegraph'
import './TracesView.css'

export default function TracesView() {
  const { data, loading, error } = useData<TracesData>(DATA_PATHS.TRACES)
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterService, setFilterService] = useState<string>('all')

  if (loading) {
    return (
      <div className="traces-view">
        <div className="loading">Loading traces...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="traces-view">
        <div className="error">Error loading traces: {error.message}</div>
      </div>
    )
  }

  if (!data?.traces) {
    return (
      <div className="traces-view">
        <div className="error">No trace data available</div>
      </div>
    )
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const getStatusClass = (status: string) => {
    return `trace-status trace-status-${status}`
  }

  // Get unique services for filter
  const services = Array.from(new Set(data.traces.map((t: Trace) => t.service))).sort()

  // Filter traces
  const filteredTraces = data.traces.filter((trace: Trace) => {
    if (filterStatus !== 'all' && trace.status !== filterStatus) return false
    if (filterService !== 'all' && trace.service !== filterService) return false
    return true
  })

  return (
    <div className="traces-view">
      <div className="traces-header">
        <h1>APM Traces</h1>
        <div className="traces-stats">
          <div className="stat">
            <span className="stat-value">{data.traces.length}</span>
            <span className="stat-label">Total Traces</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.traces.filter((t: Trace) => t.status === 'error').length}</span>
            <span className="stat-label">Errors</span>
          </div>
          <div className="stat">
            <span className="stat-value">{data.traces.filter((t: Trace) => t.status === 'warning').length}</span>
            <span className="stat-label">Warnings</span>
          </div>
        </div>
      </div>

      <div className="traces-filters">
        <div className="filter-group">
          <label htmlFor="status-filter">Status:</label>
          <select id="status-filter" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="ok">OK</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="service-filter">Service:</label>
          <select id="service-filter" value={filterService} onChange={(e) => setFilterService(e.target.value)}>
            <option value="all">All Services</option>
            {services.map((service: string) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="traces-content">
        <div className="traces-list">
          <div className="traces-list-header">
            <div className="trace-cell trace-cell-timestamp">Timestamp</div>
            <div className="trace-cell trace-cell-service">Service</div>
            <div className="trace-cell trace-cell-operation">Operation</div>
            <div className="trace-cell trace-cell-duration">Duration</div>
            <div className="trace-cell trace-cell-spans">Spans</div>
            <div className="trace-cell trace-cell-status">Status</div>
          </div>
          <div className="traces-list-body">
            {filteredTraces.length === 0 ? (
              <div className="no-traces">No traces found matching your filters</div>
            ) : (
              filteredTraces.map((trace: Trace) => (
                <div
                  key={trace.id}
                  className={`trace-row ${selectedTrace?.id === trace.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTrace(trace)}
                >
                  <div className="trace-cell trace-cell-timestamp">{formatTimestamp(trace.timestamp)}</div>
                  <div className="trace-cell trace-cell-service">{trace.service}</div>
                  <div className="trace-cell trace-cell-operation">{trace.operation}</div>
                  <div className="trace-cell trace-cell-duration">{formatDuration(trace.duration)}</div>
                  <div className="trace-cell trace-cell-spans">{trace.spans.length}</div>
                  <div className="trace-cell trace-cell-status">
                    <span className={getStatusClass(trace.status)}>{trace.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {selectedTrace && (
          <div className="trace-details">
            <div className="trace-details-header">
              <h2>Trace Details</h2>
              <button className="close-button" onClick={() => setSelectedTrace(null)}>
                ×
              </button>
            </div>
            <div className="trace-details-info">
              <div className="trace-info-row">
                <span className="trace-info-label">Trace ID:</span>
                <span className="trace-info-value">{selectedTrace.traceId}</span>
              </div>
              <div className="trace-info-row">
                <span className="trace-info-label">Service:</span>
                <span className="trace-info-value">{selectedTrace.service}</span>
              </div>
              <div className="trace-info-row">
                <span className="trace-info-label">Operation:</span>
                <span className="trace-info-value">{selectedTrace.operation}</span>
              </div>
              <div className="trace-info-row">
                <span className="trace-info-label">Duration:</span>
                <span className="trace-info-value">{formatDuration(selectedTrace.duration)}</span>
              </div>
              <div className="trace-info-row">
                <span className="trace-info-label">Status:</span>
                <span className={getStatusClass(selectedTrace.status)}>{selectedTrace.status}</span>
              </div>
            </div>
            <Flamegraph spans={selectedTrace.spans} totalDuration={selectedTrace.duration} />
          </div>
        )}
      </div>
    </div>
  )
}
