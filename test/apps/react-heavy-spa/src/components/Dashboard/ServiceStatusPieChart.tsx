import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import './ServiceStatusPieChart.css'

interface LogLevelData {
  name: string
  value: number
  color: string
}

interface ServiceStatusPieChartProps {
  data: LogLevelData[]
  loading?: boolean
}

export default function ServiceStatusPieChart({ data, loading = false }: ServiceStatusPieChartProps) {
  return (
    <div className="service-status-pie-chart">
      <h3 className="chart-title">Log Level Distribution</h3>
      {loading ? (
        <div className="chart-loading">
          <div className="loading-spinner"></div>
          <p>Loading status data...</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#2A2A2A',
                border: '1px solid #444',
                borderRadius: '4px',
                color: '#E0E0E0',
              }}
            />
            <Legend wrapperStyle={{ color: '#E0E0E0' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
