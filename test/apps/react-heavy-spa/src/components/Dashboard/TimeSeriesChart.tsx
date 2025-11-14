import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './TimeSeriesChart.css'

interface TimeSeriesData {
  timestamp: number
  requests: number
  errors: number
  latency: number
}

interface TimeSeriesChartProps {
  data: TimeSeriesData[]
  loading?: boolean
}

export default function TimeSeriesChart({ data, loading = false }: TimeSeriesChartProps) {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="timeseries-chart">
      <h3 className="chart-title">Request Metrics Over Time</h3>
      {loading ? (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>Loading chart data...</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="timestamp" tickFormatter={formatTimestamp} stroke="#B0B0B0" style={{ fontSize: '12px' }} />
            <YAxis stroke="#B0B0B0" style={{ fontSize: '12px' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#2A2A2A',
                border: '1px solid #444',
                borderRadius: '4px',
                color: '#E0E0E0',
              }}
              labelFormatter={formatTimestamp}
            />
            <Legend wrapperStyle={{ color: '#E0E0E0' }} />
            <Line type="monotone" dataKey="requests" stroke="#632CA6" strokeWidth={2} dot={false} name="Requests" />
            <Line type="monotone" dataKey="errors" stroke="#FF5252" strokeWidth={2} dot={false} name="Errors" />
            <Line type="monotone" dataKey="latency" stroke="#3EBF62" strokeWidth={2} dot={false} name="Latency (ms)" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
