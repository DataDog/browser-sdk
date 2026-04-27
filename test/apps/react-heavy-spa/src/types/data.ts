// Common types
export interface TimeSeriesDataPoint {
  timestamp: number
  value: number
}

// Dashboard types
export interface MetricSummary {
  apm_requests: number
  logs_count: number
  infrastructure_hosts: number
  errors_count: number
}

export interface ServiceStatus {
  name: string
  status: 'healthy' | 'degraded' | 'critical'
  requests: number
  errorRate?: number
  latency?: number
}

export interface DashboardData {
  summary: MetricSummary
  timeseries: TimeSeriesDataPoint[]
  services: ServiceStatus[]
}

// Logs types
export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'

export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  service: string
  message: string
  host: string
  tags: string[]
}

export interface LogFacets {
  services: string[]
  levels: LogLevel[]
  hosts: string[]
}

export interface LogsData {
  logs: LogEntry[]
  facets: LogFacets
}

// APM/Traces types
export interface Span {
  spanId: string
  operation: string
  service: string
  resource: string
  duration: number
  error?: string
  warning?: string
}

export interface Trace {
  id: string
  traceId: string
  service: string
  operation: string
  duration: number
  timestamp: number
  status: 'ok' | 'error' | 'warning'
  spans: Span[]
}

export interface TracesData {
  traces: Trace[]
}

// Infrastructure types
export type HostStatus = 'healthy' | 'warning' | 'critical'

export interface Host {
  id: string
  name: string
  status: HostStatus
  cpu: number
  memory: number
  disk: number
  network: number
  uptime: number
  region?: string
  tags?: string[]
}

export interface HostMetricsTimeSeries {
  cpu: TimeSeriesDataPoint[]
  memory: TimeSeriesDataPoint[]
  disk?: TimeSeriesDataPoint[]
  network?: TimeSeriesDataPoint[]
}

export interface InfrastructureData {
  hosts: Host[]
  metrics: Record<string, HostMetricsTimeSeries>
}

// Settings types
export interface UserSettings {
  name: string
  email: string
  role: string
  notifications: boolean
  timezone: string
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: string
}

export interface Integration {
  id: string
  name: string
  enabled: boolean
  type: string
  icon?: string
}
