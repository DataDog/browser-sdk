import { useMemo, useCallback } from 'react'
import { FixedSizeList as List } from 'react-window'
import { LogEntry, LogLevel } from '../../types/data'
import './LogTable.css'

interface LogTableProps {
  logs: LogEntry[]
  selectedLog: LogEntry | null
  onLogSelect: (log: LogEntry) => void
}

interface LogRowProps {
  index: number
  style: React.CSSProperties
  data?: {
    logs: LogEntry[]
    selectedLog: LogEntry | null
    onLogSelect: (log: LogEntry) => void
  }
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: '#ff5252',
  WARN: '#ffa726',
  INFO: '#42a5f5',
  DEBUG: '#66bb6a',
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 60000) {
    // Less than 1 minute
    return 'just now'
  } else if (diff < 3600000) {
    // Less than 1 hour
    const minutes = Math.floor(diff / 60000)
    return `${minutes}m ago`
  } else if (diff < 86400000) {
    // Less than 1 day
    const hours = Math.floor(diff / 3600000)
    return `${hours}h ago`
  } else {
    const days = Math.floor(diff / 86400000)
    return `${days}d ago`
  }
}

function truncateMessage(message: string, maxLength: number = 120): string {
  if (message.length <= maxLength) return message
  return message.substring(0, maxLength) + '...'
}

function LogRow({ index, style, data }: LogRowProps) {
  if (!data) return null

  const { logs, selectedLog, onLogSelect } = data
  const log = logs[index]

  if (!log) return null
  const isSelected = selectedLog?.id === log.id

  const handleClick = useCallback(() => {
    onLogSelect(log)
  }, [log, onLogSelect])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onLogSelect(log)
      }
    },
    [log, onLogSelect]
  )

  return (
    <div style={style}>
      <div
        className={`log-row ${isSelected ? 'selected' : ''} ${log.level.toLowerCase()}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="row"
        aria-selected={isSelected}
        data-test-id={`log-row-${log.id}`}
      >
        <div className="log-row-content">
          <div className="log-timestamp">
            <span className="log-time">{formatTimestamp(log.timestamp)}</span>
            <span className="log-relative-time">{formatRelativeTime(log.timestamp)}</span>
          </div>

          <div className="log-level">
            <span className="log-level-indicator" style={{ backgroundColor: LOG_LEVEL_COLORS[log.level] }} />
            <span className="log-level-text">{log.level}</span>
          </div>

          <div className="log-service">{log.service}</div>

          <div className="log-host">{log.host}</div>

          <div className="log-message">{truncateMessage(log.message)}</div>

          {log.tags.length > 0 && (
            <div className="log-tags">
              {log.tags.slice(0, 2).map((tag, idx) => (
                <span key={idx} className="log-tag">
                  {tag}
                </span>
              ))}
              {log.tags.length > 2 && <span className="log-tag-more">+{log.tags.length - 2}</span>}
            </div>
          )}
        </div>

        {isSelected && <div className="log-row-selected-indicator" />}
      </div>
    </div>
  )
}

export default function LogTable({ logs, selectedLog, onLogSelect }: LogTableProps) {
  const itemData = useMemo(
    () => ({
      logs,
      selectedLog,
      onLogSelect,
    }),
    [logs, selectedLog, onLogSelect]
  )

  if (logs.length === 0) {
    return (
      <div className="log-table-container">
        <div className="log-table-header">
          <div className="log-header-cell timestamp">Timestamp</div>
          <div className="log-header-cell level">Level</div>
          <div className="log-header-cell service">Service</div>
          <div className="log-header-cell host">Host</div>
          <div className="log-header-cell message">Message</div>
          <div className="log-header-cell tags">Tags</div>
        </div>
        <div className="log-table-empty">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" className="empty-icon">
              <path
                fill="currentColor"
                d="M9,5V9H21V7.5L12,2L3,7.5V9H5V19H3V21H21V19H19V5H9M11,7H17V19H11V7M4,9V19H2V21H6V9H4M6,11H4V13H6V11M6,15H4V17H6V15M13,9V11H15V9H13M13,13V15H15V13H13Z"
              />
            </svg>
            <h3>No logs found</h3>
            <p>Try adjusting your search criteria or filters</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="log-table-container">
      <div className="log-table-header">
        <div className="log-header-cell timestamp">Timestamp</div>
        <div className="log-header-cell level">Level</div>
        <div className="log-header-cell service">Service</div>
        <div className="log-header-cell host">Host</div>
        <div className="log-header-cell message">Message</div>
        <div className="log-header-cell tags">Tags</div>
      </div>

      <div className="log-table-body">
        <List<{
          logs: LogEntry[]
          selectedLog: LogEntry | null
          onLogSelect: (log: LogEntry) => void
        }>
          height={600}
          width="100%"
          itemCount={logs.length}
          itemSize={80}
          itemData={itemData}
          overscanCount={5}
        >
          {LogRow}
        </List>
      </div>

      <div className="log-table-footer">
        <span className="log-count">{logs.length} logs displayed</span>
      </div>
    </div>
  )
}
