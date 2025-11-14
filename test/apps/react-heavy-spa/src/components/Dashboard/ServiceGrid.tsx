import './ServiceGrid.css'

interface Service {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  requests: number
  errors: number
  avgLatency: number
}

interface ServiceGridProps {
  services: Service[]
  loading?: boolean
}

export default function ServiceGrid({ services, loading = false }: ServiceGridProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'var(--color-success, #3EBF62)'
      case 'warning':
        return 'var(--color-warning, #FFA726)'
      case 'critical':
        return 'var(--color-error, #FF5252)'
      default:
        return 'var(--color-text-secondary, #B0B0B0)'
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toString()
  }

  return (
    <div className="service-grid">
      <h3 className="grid-title">Service Health</h3>
      {loading ? (
        <div className="grid-loading">
          <div className="loading-spinner"></div>
          <p>Loading services...</p>
        </div>
      ) : (
        <div className="grid-container">
          {services.map((service) => (
            <div key={service.name} className="service-card">
              <div className="service-header">
                <span className="service-status-dot" style={{ backgroundColor: getStatusColor(service.status) }} />
                <h4 className="service-name">{service.name}</h4>
              </div>
              <div className="service-metrics">
                <div className="service-metric">
                  <span className="metric-label">Requests:</span>
                  <span className="metric-val">{formatNumber(service.requests)}</span>
                </div>
                <div className="service-metric">
                  <span className="metric-label">Errors:</span>
                  <span className="metric-val">{service.errors}</span>
                </div>
                <div className="service-metric">
                  <span className="metric-label">Latency:</span>
                  <span className="metric-val">{service.avgLatency}ms</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
