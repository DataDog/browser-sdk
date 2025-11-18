import './MetricCard.css'

interface MetricCardProps {
  title: string
  value: number | string
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
}

export default function MetricCard({ title, value, unit, trend }: MetricCardProps) {
  const formatValue = (val: number | string) => {
    if (typeof val === 'number') {
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(2)}M`
      }
      if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`
      }
      return val.toLocaleString()
    }
    return val
  }

  return (
    <div className="metric-card">
      <div className="metric-header">
        <h3 className="metric-title">{title}</h3>
        {trend && (
          <span className={`metric-trend metric-trend-${trend}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
          </span>
        )}
      </div>
      <div className="metric-value">
        {formatValue(value)}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
    </div>
  )
}
