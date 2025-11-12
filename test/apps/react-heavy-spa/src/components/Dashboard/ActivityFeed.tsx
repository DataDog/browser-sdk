import './ActivityFeed.css'

interface Activity {
  id: number
  type: 'alert' | 'deployment' | 'incident'
  severity: 'critical' | 'warning' | 'info'
  service: string
  message: string
  timestamp: number
}

interface ActivityFeedProps {
  activities: Activity[]
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
  const getSeverityClass = (severity: string) => {
    return `activity-severity-${severity}`
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return '⚠️'
      case 'deployment':
        return '🚀'
      case 'incident':
        return '🔥'
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

  return (
    <div className="activity-feed">
      <h3 className="feed-title">Recent Activity</h3>
      <div className="activity-list">
        {activities.map((activity) => (
          <div key={activity.id} className={`activity-item ${getSeverityClass(activity.severity)}`}>
            <div className="activity-icon">{getTypeIcon(activity.type)}</div>
            <div className="activity-content">
              <div className="activity-header">
                <span className="activity-service">{activity.service}</span>
                <span className="activity-time">{formatTimestamp(activity.timestamp)}</span>
              </div>
              <p className="activity-message">{activity.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
