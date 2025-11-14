import { Trace } from '../../types/data'
import './ActivityFeed.css'

interface ActivityFeedProps {
  traces: Trace[]
  loading?: boolean
}

export default function ActivityFeed({ traces, loading = false }: ActivityFeedProps) {
  const getStatusClass = (status: string) => {
    return `activity-severity-${status === 'ok' ? 'info' : status === 'error' ? 'critical' : 'warning'}`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return '✓'
      case 'error':
        return '✗'
      case 'warning':
        return '⚠'
      default:
        return '📋'
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const formatDuration = (duration: number) => {
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(2)}s`
  }

  return (
    <div className="activity-feed">
      <h3 className="feed-title">Recent Traces</h3>
      {loading ? (
        <div className="feed-loading">
          <div className="loading-spinner"></div>
          <p>Loading traces...</p>
        </div>
      ) : (
        <div className="activity-list">
          {traces.map((trace) => (
            <div key={trace.id} className={`activity-item ${getStatusClass(trace.status)}`}>
              <div className="activity-icon">{getStatusIcon(trace.status)}</div>
              <div className="activity-content">
                <div className="activity-header">
                  <span className="activity-service">{trace.service}</span>
                  <span className="activity-time">{formatTimestamp(trace.timestamp)}</span>
                </div>
                <p className="activity-message">
                  {trace.operation} - {formatDuration(trace.duration)} ({trace.spans.length} spans)
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
