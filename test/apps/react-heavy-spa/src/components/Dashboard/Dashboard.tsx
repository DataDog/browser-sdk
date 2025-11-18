import { useMemo } from 'react'
import { useData } from '../../hooks/useData'
import MetricCard from './MetricCard'
import TimeSeriesChart from './TimeSeriesChart'
import ServiceStatusPieChart from './ServiceStatusPieChart'
import ServiceGrid from './ServiceGrid'
import ActivityFeed from './ActivityFeed'
import { LogsData, TracesData } from '../../types/data'
import './Dashboard.css'
import { heavyComputation } from '../../utils/performanceThrottle'

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
  const { data: metricsData, loading: timeseriesLoading } = useData<MetricsData>('/data/metrics.json', 10)
  const { data: logsData, loading: pieChartLoading } = useData<LogsData>('/data/logs.json', 20)
  const { data: metricsData2, loading: servicesLoading } = useData<MetricsData>('/data/metrics.json', 50)
  const { data: tracesData, loading: activityLoading } = useData<TracesData>('/data/traces.json', 25)

  // Extract timeseries data from the first fetch
  const timeseriesData = metricsData?.timeseries || []

  // Extract logs data for pie chart from the second fetch
  const logs = logsData?.logs || []

  // Extract services data from the third fetch
  const servicesData = metricsData2?.services || []

  // Extract traces data from the fourth fetch
  const traces = tracesData?.traces || []

  // Heavy computation on data processing (simulates expensive data transformations)
  const processedTimeseries = useMemo(() => {
    if (!timeseriesData || timeseriesData.length === 0) return []
    console.log('[Performance] Processing timeseries data with heavy computation')
    return timeseriesData
  }, [timeseriesData])

  // Compute metrics from services data
  const computedMetrics = useMemo(() => {
    if (!servicesData || servicesData.length === 0 || !timeseriesData || timeseriesData.length === 0) return null

    // Calculate total requests and errors from services
    const totalRequests = servicesData.reduce((sum, service) => sum + service.requests, 0)
    const totalErrors = servicesData.reduce((sum, service) => sum + service.errors, 0)

    // Calculate average latency weighted by request count
    const totalWeightedLatency = servicesData.reduce((sum, service) => sum + service.avgLatency * service.requests, 0)
    const avgResponseTime = Math.round(totalWeightedLatency / totalRequests)

    // Calculate p95 latency (approximate from highest service latencies)
    const sortedLatencies = servicesData.map((s) => s.avgLatency).sort((a, b) => b - a)
    const p95Index = Math.ceil(sortedLatencies.length * 0.05)
    const p95ResponseTime = sortedLatencies[p95Index] || sortedLatencies[0]

    // Count number of hosts (services in this case)
    const infrastructureHosts = servicesData.length

    heavyComputation([totalRequests], 200)
    return {
      apm_requests: totalRequests,
      logs_count: logs.length,
      infrastructure_hosts: infrastructureHosts,
      errors_count: totalErrors,
      avg_response_time: avgResponseTime,
      p95_response_time: p95ResponseTime,
    }
  }, [servicesData, timeseriesData, logs])

  // Compute log level distribution for pie chart
  const logLevelData = useMemo(() => {
    if (!logs || logs.length === 0) return []

    const levelCounts = logs.reduce(
      (acc, log) => {
        acc[log.level] = (acc[log.level] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const colors = {
      ERROR: '#FF5252',
      WARN: '#FFA726',
      INFO: '#42A5F5',
      DEBUG: '#66BB6A',
    }

    return Object.entries(levelCounts).map(([level, count]) => ({
      name: level,
      value: count,
      color: colors[level as keyof typeof colors] || '#999',
    }))
  }, [logs])

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Dashboard</h1>

      {/* Metrics appear after chart, responsible for CLS */}
      {computedMetrics && (
        <div className="metrics-grid">
          <MetricCard title="APM Requests" value={computedMetrics.apm_requests} trend="up" />
          <MetricCard title="Logs Count" value={computedMetrics.logs_count} trend="up" />
          <MetricCard title="Infrastructure Hosts" value={computedMetrics.infrastructure_hosts} />
          <MetricCard title="Errors" value={computedMetrics.errors_count} trend="down" />
          <MetricCard title="Avg Response Time" value={computedMetrics.avg_response_time} unit="ms" />
          <MetricCard title="P95 Response Time" value={computedMetrics.p95_response_time} unit="ms" />
        </div>
      )}

      <div className="charts-section">
        <TimeSeriesChart data={processedTimeseries} loading={timeseriesLoading} />
        <ServiceStatusPieChart data={logLevelData} loading={pieChartLoading} />
      </div>

      <div className="content-grid">
        <ServiceGrid services={servicesData} loading={servicesLoading} />
        <ActivityFeed traces={traces} loading={activityLoading} />
      </div>
    </div>
  )
}
