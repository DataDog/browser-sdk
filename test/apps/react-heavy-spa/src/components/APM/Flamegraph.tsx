import { Span } from '../../types/data'
import './Flamegraph.css'

interface FlamegraphProps {
  spans: Span[]
  totalDuration: number
}

export default function Flamegraph({ spans, totalDuration }: FlamegraphProps) {
  const getSpanColor = (span: Span) => {
    if (span.error) return '#e74c3c'
    if (span.warning) return '#f39c12'

    // Color by service
    const colors = [
      '#3498db',
      '#2ecc71',
      '#9b59b6',
      '#1abc9c',
      '#34495e',
      '#16a085',
      '#27ae60',
      '#2980b9',
      '#8e44ad',
      '#2c3e50',
      '#f1c40f',
      '#e67e22',
    ]
    const hash = span.service.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <div className="flamegraph">
      <div className="flamegraph-header">
        <span className="flamegraph-title">Trace Flamegraph</span>
        <span className="flamegraph-duration">Total: {formatDuration(totalDuration)}</span>
      </div>
      <div className="flamegraph-timeline">
        {spans.map((span, index) => {
          const widthPercent = (span.duration / totalDuration) * 100
          const leftPercent =
            index === 0 ? 0 : spans.slice(0, index).reduce((acc, s) => acc + (s.duration / totalDuration) * 100, 0)

          return (
            <div
              key={span.spanId}
              className="flamegraph-span"
              style={{
                width: `${widthPercent}%`,
                left: `${leftPercent}%`,
                backgroundColor: getSpanColor(span),
              }}
              title={`${span.operation} - ${span.service}\n${span.resource}\n${formatDuration(span.duration)}`}
            >
              <span className="flamegraph-span-label">
                {widthPercent > 10 ? `${span.operation} (${formatDuration(span.duration)})` : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flamegraph-spans-list">
        {spans.map((span) => (
          <div key={span.spanId} className="flamegraph-span-row">
            <div className="flamegraph-span-color" style={{ backgroundColor: getSpanColor(span) }} />
            <div className="flamegraph-span-info">
              <div className="flamegraph-span-operation">{span.operation}</div>
              <div className="flamegraph-span-details">
                <span className="flamegraph-span-service">{span.service}</span>
                <span className="flamegraph-span-resource">{span.resource}</span>
              </div>
            </div>
            <div className="flamegraph-span-duration">{formatDuration(span.duration)}</div>
            {span.error && <div className="flamegraph-span-error">Error: {span.error}</div>}
            {span.warning && <div className="flamegraph-span-warning">Warning: {span.warning}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
