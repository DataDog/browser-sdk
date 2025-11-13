import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Host, HostMetricsTimeSeries } from '../../types/data'
import './HostDetails.css'

interface HostDetailsProps {
  host: Host
  metrics: HostMetricsTimeSeries
  onClose: () => void
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)

  return parts.join(' ')
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function HostDetails({ host, metrics, onClose }: HostDetailsProps) {
  const cpuData = metrics.cpu.map((point) => ({
    time: formatTimestamp(point.timestamp),
    value: point.value,
  }))

  const memoryData = metrics.memory.map((point) => ({
    time: formatTimestamp(point.timestamp),
    value: point.value,
  }))

  const diskData = metrics.disk?.map((point) => ({
    time: formatTimestamp(point.timestamp),
    value: point.value,
  }))

  const networkData = metrics.network?.map((point) => ({
    time: formatTimestamp(point.timestamp),
    value: point.value,
  }))

  return (
    <div className="host-details">
      <div className="host-details-header">
        <div className="host-details-title">
          <h3>{host.name}</h3>
          <span className={`status-badge ${host.status}`}>{host.status}</span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close details">
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      <div className="host-details-summary">
        <div className="summary-item">
          <span className="summary-label">CPU</span>
          <span className="summary-value cpu">{host.cpu}%</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Memory</span>
          <span className="summary-value memory">{host.memory}%</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Disk</span>
          <span className="summary-value disk">{host.disk}%</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Network</span>
          <span className="summary-value network">{host.network} Mbps</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Uptime</span>
          <span className="summary-value uptime">{formatUptime(host.uptime)}</span>
        </div>
      </div>

      <div className="host-details-charts">
        <div className="chart-container">
          <h4>CPU Usage</h4>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cpuData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="time" stroke="#888888" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  stroke="#888888"
                  tick={{ fontSize: 10 }}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(42, 42, 42, 0.95)',
                    border: '1px solid #3A3A3A',
                    borderRadius: '4px',
                    color: '#E0E0E0',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#42a5f5"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-container">
          <h4>Memory Usage</h4>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={memoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="time" stroke="#888888" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  stroke="#888888"
                  tick={{ fontSize: 10 }}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(42, 42, 42, 0.95)',
                    border: '1px solid #3A3A3A',
                    borderRadius: '4px',
                    color: '#E0E0E0',
                  }}
                  formatter={(value: number) => `${value}%`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#ffa726"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {diskData && (
          <div className="chart-container">
            <h4>Disk Usage</h4>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={diskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="time" stroke="#888888" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis
                    stroke="#888888"
                    tick={{ fontSize: 10 }}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(42, 42, 42, 0.95)',
                      border: '1px solid #3A3A3A',
                      borderRadius: '4px',
                      color: '#E0E0E0',
                    }}
                    formatter={(value: number) => `${value}%`}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#66bb6a"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {networkData && (
          <div className="chart-container">
            <h4>Network Traffic</h4>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={networkData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="time" stroke="#888888" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis stroke="#888888" tick={{ fontSize: 10 }} tickFormatter={(value) => `${value}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(42, 42, 42, 0.95)',
                      border: '1px solid #3A3A3A',
                      borderRadius: '4px',
                      color: '#E0E0E0',
                    }}
                    formatter={(value: number) => `${value} Mbps`}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#ab47bc"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
