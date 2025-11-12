import { useData } from '../../hooks/useData'
import MetricCard from './MetricCard'
import TimeSeriesChart from './TimeSeriesChart'
import ServiceGrid from './ServiceGrid'
import ActivityFeed from './ActivityFeed'
import './Dashboard.css'

interface MetricsData {
  summary: {
    apm_requests: number
    logs_count: number
    infrastructure_hosts: number
    errors_count: number
    avg_response_time: number
    p95_response_time: number
  }
  timeseries: Array<{
    timestamp: number
    requests: number
    errors: number
    latency: number
  }>
  services: Array<{
    name: string
    status: 'healthy' | 'warning' | 'critical'
    requests: number
    errors: number
    avgLatency: number
  }>
  activity: Array<{
    id: number
    type: 'alert' | 'deployment' | 'incident'
    severity: 'critical' | 'warning' | 'info'
    service: string
    message: string
    timestamp: number
  }>
}

export default function Dashboard() {
  const { data, loading, error } = useData<MetricsData>('/data/metrics.json')

  if (loading) {
    return (
      <div className="dashboard">
        <div className="loading-state">Loading dashboard...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard">
        <div className="error-state">Error: {error.message}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="dashboard">
        <div className="error-state">No data available</div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Dashboard</h1>

      <div className="metrics-grid">
        <MetricCard title="APM Requests" value={data.summary.apm_requests} trend="up" />
        <MetricCard title="Logs Count" value={data.summary.logs_count} trend="up" />
        <MetricCard title="Infrastructure Hosts" value={data.summary.infrastructure_hosts} />
        <MetricCard title="Errors" value={data.summary.errors_count} trend="down" />
        <MetricCard title="Avg Response Time" value={data.summary.avg_response_time} unit="ms" />
        <MetricCard title="P95 Response Time" value={data.summary.p95_response_time} unit="ms" />
      </div>

      <div className="charts-section">
        <TimeSeriesChart data={data.timeseries} />
      </div>

      <div className="content-grid">
        <ServiceGrid services={data.services} />
        <ActivityFeed activities={data.activity} />
      </div>
    </div>
  )
}
