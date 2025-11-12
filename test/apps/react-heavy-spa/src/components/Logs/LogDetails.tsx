import React, { useState, useCallback } from 'react'
import { LogEntry, LogLevel } from '../../types/data'
import './LogDetails.css'

interface LogDetailsProps {
  log: LogEntry
  onClose: () => void
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
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    hour12: false,
  })
}

function copyToClipboard(text: string): void {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      // Could show a toast notification here
    })
    .catch((err) => {
      console.error('Failed to copy text:', err)
    })
}

export default function LogDetails({ log, onClose }: LogDetailsProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'raw'>('details')
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const logText = `[${formatTimestamp(log.timestamp)}] ${log.level} ${log.service}@${log.host}: ${log.message}`
    copyToClipboard(logText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [log])

  const handleCopyRaw = useCallback(() => {
    const rawLog = JSON.stringify(log, null, 2)
    copyToClipboard(rawLog)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [log])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  return (
    <div className="log-details" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="log-details-header">
        <div className="log-details-title">
          <span className="log-level-indicator" style={{ backgroundColor: LOG_LEVEL_COLORS[log.level] }} />
          <span className="log-level-text">{log.level}</span>
          <span className="log-id">({log.id})</span>
        </div>

        <div className="log-details-actions">
          <button
            className={`copy-btn ${copied ? 'copied' : ''}`}
            onClick={activeTab === 'details' ? handleCopy : handleCopyRaw}
            title="Copy to clipboard"
          >
            {copied ? (
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
              </svg>
            )}
            {copied ? 'Copied!' : 'Copy'}
          </button>

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
      </div>

      <div className="log-details-tabs">
        <button
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`} onClick={() => setActiveTab('raw')}>
          Raw
        </button>
      </div>

      <div className="log-details-content">
        {activeTab === 'details' ? (
          <div className="log-details-view">
            <div className="detail-section">
              <h4>Timestamp</h4>
              <div className="detail-value timestamp-value">{formatTimestamp(log.timestamp)}</div>
            </div>

            <div className="detail-section">
              <h4>Level</h4>
              <div className="detail-value level-value">
                <span className="log-level-indicator small" style={{ backgroundColor: LOG_LEVEL_COLORS[log.level] }} />
                {log.level}
              </div>
            </div>

            <div className="detail-section">
              <h4>Service</h4>
              <div className="detail-value service-value">{log.service}</div>
            </div>

            <div className="detail-section">
              <h4>Host</h4>
              <div className="detail-value host-value">{log.host}</div>
            </div>

            <div className="detail-section">
              <h4>Message</h4>
              <div className="detail-value message-value">{log.message}</div>
            </div>

            {log.tags.length > 0 && (
              <div className="detail-section">
                <h4>Tags</h4>
                <div className="detail-value tags-value">
                  {log.tags.map((tag, index) => (
                    <span key={index} className="tag-item">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="detail-section">
              <h4>Log ID</h4>
              <div className="detail-value id-value">{log.id}</div>
            </div>
          </div>
        ) : (
          <div className="log-raw-view">
            <pre className="log-raw-content">{JSON.stringify(log, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
