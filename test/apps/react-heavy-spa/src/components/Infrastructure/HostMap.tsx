import React from 'react'
import { Host } from '../../types/data'
import './HostMap.css'

interface HostMapProps {
  hosts: Host[]
  selectedHost: Host | null
  onHostSelect: (host: Host) => void
}

function formatHostName(name: string): string {
  // Extract the last part after the last hyphen (e.g., "prod-web-01" -> "01")
  const parts = name.split('-')
  return parts[parts.length - 1]
}

function getHostCategory(name: string): string {
  // Extract the middle part (e.g., "prod-web-01" -> "web")
  const parts = name.split('-')
  return parts.slice(1, -1).join('-')
}

export default function HostMap({ hosts, selectedHost, onHostSelect }: HostMapProps) {
  // Group hosts by category
  const hostsByCategory = React.useMemo(() => {
    const grouped: Record<string, Host[]> = {}
    hosts.forEach((host) => {
      const category = getHostCategory(host.name)
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(host)
    })
    return grouped
  }, [hosts])

  const categories = Object.keys(hostsByCategory).sort()

  return (
    <div className="host-map">
      <div className="host-map-header">
        <h3>Host Map</h3>
        <div className="host-map-legend">
          <div className="legend-item">
            <span className="legend-dot healthy" />
            <span>Healthy</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot warning" />
            <span>Warning</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot critical" />
            <span>Critical</span>
          </div>
        </div>
      </div>

      <div className="host-map-grid">
        {categories.map((category) => (
          <div key={category} className="host-category">
            <div className="category-label">{category}</div>
            <div className="category-hosts">
              {hostsByCategory[category].map((host) => (
                <div
                  key={host.id}
                  className={`host-cell ${host.status} ${selectedHost?.id === host.id ? 'selected' : ''}`}
                  onClick={() => onHostSelect(host)}
                  title={`${host.name}\nCPU: ${host.cpu}%\nMemory: ${host.memory}%\nDisk: ${host.disk}%`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onHostSelect(host)
                    }
                  }}
                >
                  <span className="host-cell-label">{formatHostName(host.name)}</span>
                  <div className="host-cell-status">
                    <div className="status-bar cpu" style={{ width: `${host.cpu}%` }} />
                    <div className="status-bar memory" style={{ width: `${host.memory}%` }} />
                    <div className="status-bar disk" style={{ width: `${host.disk}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
