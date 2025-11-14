import { useState, useMemo, useCallback, memo, Dispatch, SetStateAction } from 'react'
import { FixedSizeList as List } from 'react-window'
import { Host, HostStatus } from '../../types/data'
import './HostList.css'

interface HostListProps {
  hosts: Host[]
  filteredHosts: Host[]
  selectedHost: Host | null
  onHostSelect: (host: Host) => void
  statusFilter: HostStatus | 'all'
  setStatusFilter: Dispatch<SetStateAction<HostStatus | 'all'>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
}

type SortField = 'name' | 'status' | 'cpu' | 'memory' | 'disk' | 'network' | 'uptime'
type SortDirection = 'asc' | 'desc'

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  return `${hours}h`
}

function getStatusOrder(status: HostStatus): number {
  const order = { critical: 0, warning: 1, healthy: 2 }
  return order[status]
}

// Extract SortIcon as a separate memoized component
const SortIcon = memo(
  ({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) => {
    if (sortField !== field) {
      return (
        <svg className="sort-icon inactive" viewBox="0 0 20 20" fill="currentColor">
          <path d="M5 12a1 1 0 102 0V6.414l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L5 6.414V12zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z" />
        </svg>
      )
    }

    return sortDirection === 'asc' ? (
      <svg className="sort-icon active" viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h7a1 1 0 100-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM15 8a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L15 13.586V8z" />
      </svg>
    ) : (
      <svg className="sort-icon active" viewBox="0 0 20 20" fill="currentColor">
        <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h5a1 1 0 000-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM13 16a1 1 0 102 0v-5.586l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L13 10.414V16z" />
      </svg>
    )
  }
)

// Memoized row component for better performance
const HostRow = memo(
  ({ host, isSelected, onSelect }: { host: Host; isSelected: boolean; onSelect: (host: Host) => void }) => (
    <tr className={`host-row ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(host)}>
      <td className="host-name">{host.name}</td>
      <td>
        <span className={`status-badge ${host.status}`}>{host.status}</span>
      </td>
      <td>
        <div className="metric-cell">
          <div className="metric-bar">
            <div className="metric-fill cpu" style={{ width: `${host.cpu}%` }} />
          </div>
          <span className="metric-value">{host.cpu}%</span>
        </div>
      </td>
      <td>
        <div className="metric-cell">
          <div className="metric-bar">
            <div className="metric-fill memory" style={{ width: `${host.memory}%` }} />
          </div>
          <span className="metric-value">{host.memory}%</span>
        </div>
      </td>
      <td>
        <div className="metric-cell">
          <div className="metric-bar">
            <div className="metric-fill disk" style={{ width: `${host.disk}%` }} />
          </div>
          <span className="metric-value">{host.disk}%</span>
        </div>
      </td>
      <td className="network-cell">{host.network} Mbps</td>
      <td className="uptime-cell">{formatUptime(host.uptime)}</td>
    </tr>
  )
)

const HostList = memo(function HostList({
  hosts,
  filteredHosts,
  selectedHost,
  onHostSelect,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
}: HostListProps) {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortField(field)
        setSortDirection('asc')
      }
    },
    [sortField]
  )

  const filteredAndSortedHosts = useMemo(() => {
    console.log('[Performance] Sorting hosts with heavy computation (HostList)')

    // Apply sorting to already-filtered hosts
    const sorted = [...filteredHosts].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'status':
          comparison = getStatusOrder(a.status) - getStatusOrder(b.status)
          break
        case 'cpu':
          comparison = a.cpu - b.cpu
          break
        case 'memory':
          comparison = a.memory - b.memory
          break
        case 'disk':
          comparison = a.disk - b.disk
          break
        case 'network':
          comparison = a.network - b.network
          break
        case 'uptime':
          comparison = a.uptime - b.uptime
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })

    return sorted
  }, [filteredHosts, sortField, sortDirection])

  const statusCounts = useMemo(() => {
    return {
      all: hosts.length,
      healthy: hosts.filter((h) => h.status === 'healthy').length,
      warning: hosts.filter((h) => h.status === 'warning').length,
      critical: hosts.filter((h) => h.status === 'critical').length,
    }
  }, [hosts])

  return (
    <div className="host-list">
      <div className="host-list-header">
        <h3>Host List</h3>
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

      <div className="host-table-container">
        <table className="host-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('name')}>
                <div className="th-content">
                  Name <SortIcon field="name" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th onClick={() => handleSort('status')}>
                <div className="th-content">
                  Status <SortIcon field="status" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th onClick={() => handleSort('cpu')}>
                <div className="th-content">
                  CPU <SortIcon field="cpu" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th onClick={() => handleSort('memory')}>
                <div className="th-content">
                  Memory <SortIcon field="memory" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th onClick={() => handleSort('disk')}>
                <div className="th-content">
                  Disk <SortIcon field="disk" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th onClick={() => handleSort('network')}>
                <div className="th-content">
                  Network <SortIcon field="network" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
              <th onClick={() => handleSort('uptime')}>
                <div className="th-content">
                  Uptime <SortIcon field="uptime" sortField={sortField} sortDirection={sortDirection} />
                </div>
              </th>
            </tr>
          </thead>
        </table>
        <div style={{ height: 'calc(100vh - 350px)', overflow: 'auto' }}>
          <List
            height={Math.min(filteredAndSortedHosts.length * 45 + 10, window.innerHeight - 350)}
            itemCount={filteredAndSortedHosts.length}
            itemSize={45}
            width="100%"
            overscanCount={5}
          >
            {({ index, style }) => {
              const host = filteredAndSortedHosts[index]
              return (
                <div style={style}>
                  <table className="host-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <tbody>
                      <HostRow host={host} isSelected={selectedHost?.id === host.id} onSelect={onHostSelect} />
                    </tbody>
                  </table>
                </div>
              )
            }}
          </List>
        </div>
      </div>

      <div className="host-list-footer">
        Showing {filteredAndSortedHosts.length} of {hosts.length} hosts
      </div>
    </div>
  )
})

export default HostList
