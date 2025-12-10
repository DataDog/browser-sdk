import React, { Dispatch, SetStateAction } from 'react'
import { Host, HostStatus } from '../../types/data'
import './HostMap.css'

interface HostMapProps {
  hosts: Host[]
  filteredHosts: Host[]
  selectedHost: Host | null
  onHostSelect: (host: Host) => void
  statusFilter: HostStatus | 'all'
  setStatusFilter: Dispatch<SetStateAction<HostStatus | 'all'>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
}

function getHostCategory(name: string): string {
  // Extract the middle part (e.g., "prod-web-01" -> "web")
  const parts = name.split('-')
  return parts.slice(1, -1).join('-')
}

function formatHostName(name: string): string {
  // Extract the last part after the last hyphen (e.g., "prod-web-01" -> "01")
  const parts = name.split('-')
  return parts[parts.length - 1]
}

// Memoized host cell component for better performance
const HostCell = React.memo(
  ({ host, isSelected, onSelect }: { host: Host; isSelected: boolean; onSelect: (host: Host) => void }) => (
    <div
      className={`host-cell ${host.status} ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(host)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(host)
        }
      }}
    >
      <div className="host-cell-content">
        <div className="host-cell-header">
          <div className="host-cell-label-wrapper">
            <span className="host-cell-label">{formatHostName(host.name)}</span>
          </div>
        </div>
        <div className="host-cell-body">
          <div className="host-cell-status">
            <div className="status-bar-wrapper">
              <span className="status-bar-label">CPU</span>
              <div className="status-bar cpu">
                <div className="status-bar-inner" style={{ width: `${host.cpu}%` }} />
              </div>
              <span className="status-bar-value">{host.cpu}%</span>
            </div>
            <div className="status-bar-wrapper">
              <span className="status-bar-label">MEM</span>
              <div className="status-bar memory">
                <div className="status-bar-inner" style={{ width: `${host.memory}%` }} />
              </div>
              <span className="status-bar-value">{host.memory}%</span>
            </div>
            <div className="status-bar-wrapper">
              <span className="status-bar-label">DSK</span>
              <div className="status-bar disk">
                <div className="status-bar-inner" style={{ width: `${host.disk}%` }} />
              </div>
              <span className="status-bar-value">{host.disk}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
)

const HostMap = React.memo(function HostMap({
  hosts,
  filteredHosts,
  selectedHost,
  onHostSelect,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
}: HostMapProps) {
  // Group filtered hosts by category
  const hostsByCategory = React.useMemo(() => {
    const grouped: Record<string, Host[]> = {}
    filteredHosts.forEach((host) => {
      const category = getHostCategory(host.name)
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(host)
    })
    return grouped
  }, [filteredHosts])

  const categories = Object.keys(hostsByCategory).sort()

  // Calculate stats for each category
  const getCategoryStats = (categoryHosts: Host[]) => {
    return {
      total: categoryHosts.length,
      healthy: categoryHosts.filter((h) => h.status === 'healthy').length,
      warning: categoryHosts.filter((h) => h.status === 'warning').length,
      critical: categoryHosts.filter((h) => h.status === 'critical').length,
    }
  }

  const statusCounts = React.useMemo(() => {
    return {
      all: hosts.length,
      healthy: hosts.filter((h) => h.status === 'healthy').length,
      warning: hosts.filter((h) => h.status === 'warning').length,
      critical: hosts.filter((h) => h.status === 'critical').length,
    }
  }, [hosts])

  return (
    <div className="host-map">
      <div className="host-map-header">
        <h3>Host Map</h3>
        <div className="host-list-controls">
          <input
            type="text"
            className="host-search"
            placeholder="Search hosts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="status-filters">
            <button
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({statusCounts.all})
            </button>
            <button
              className={`filter-btn healthy ${statusFilter === 'healthy' ? 'active' : ''}`}
              onClick={() => setStatusFilter('healthy')}
            >
              Healthy ({statusCounts.healthy})
            </button>
            <button
              className={`filter-btn warning ${statusFilter === 'warning' ? 'active' : ''}`}
              onClick={() => setStatusFilter('warning')}
            >
              Warning ({statusCounts.warning})
            </button>
            <button
              className={`filter-btn critical ${statusFilter === 'critical' ? 'active' : ''}`}
              onClick={() => setStatusFilter('critical')}
            >
              Critical ({statusCounts.critical})
            </button>
          </div>
        </div>
      </div>

      <div className="host-map-grid">
        {categories.map((category) => {
          const categoryHosts = hostsByCategory[category]
          const stats = getCategoryStats(categoryHosts)

          return (
            <div key={category} className="host-category">
              <div className="category-wrapper">
                <div className="category-label-container">
                  <div className="category-label">{category}</div>
                  <div className="category-stats">
                    <span className="category-stat">
                      <span style={{ color: '#3ebf62' }}>●</span> {stats.healthy}
                    </span>
                    <span className="category-stat">
                      <span style={{ color: '#ffa726' }}>●</span> {stats.warning}
                    </span>
                    <span className="category-stat">
                      <span style={{ color: '#ff5252' }}>●</span> {stats.critical}
                    </span>
                    <span className="category-stat">Total: {stats.total}</span>
                  </div>
                </div>
              </div>
              <div className="category-hosts-wrapper">
                <div className="category-hosts">
                  {categoryHosts.map((host) => (
                    <HostCell
                      key={host.id}
                      host={host}
                      isSelected={selectedHost?.id === host.id}
                      onSelect={onHostSelect}
                    />
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="host-map-footer">
        Showing {filteredHosts.length} of {hosts.length} hosts
      </div>
    </div>
  )
})

export default HostMap
