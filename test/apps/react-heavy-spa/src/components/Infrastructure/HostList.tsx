import { useState, useMemo, useCallback } from 'react'
import { Host, HostStatus } from '../../types/data'
import './HostList.css'

interface HostListProps {
  hosts: Host[]
  selectedHost: Host | null
  onHostSelect: (host: Host) => void
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

export default function HostList({ hosts, selectedHost, onHostSelect }: HostListProps) {
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [statusFilter, setStatusFilter] = useState<HostStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
    let filtered = hosts

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((host) => host.status === statusFilter)
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((host) => host.name.toLowerCase().includes(searchQuery.toLowerCase()))
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
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
  }, [hosts, statusFilter, searchQuery, sortField, sortDirection])

  const statusCounts = useMemo(() => {
    return {
      all: hosts.length,
      healthy: hosts.filter((h) => h.status === 'healthy').length,
      warning: hosts.filter((h) => h.status === 'warning').length,
      critical: hosts.filter((h) => h.status === 'critical').length,
    }
  }, [hosts])

  const SortIcon = ({ field }: { field: SortField }) => {
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
                  Name <SortIcon field="name" />
                </div>
              </th>
              <th onClick={() => handleSort('status')}>
                <div className="th-content">
                  Status <SortIcon field="status" />
                </div>
              </th>
              <th onClick={() => handleSort('cpu')}>
                <div className="th-content">
                  CPU <SortIcon field="cpu" />
                </div>
              </th>
              <th onClick={() => handleSort('memory')}>
                <div className="th-content">
                  Memory <SortIcon field="memory" />
                </div>
              </th>
              <th onClick={() => handleSort('disk')}>
                <div className="th-content">
                  Disk <SortIcon field="disk" />
                </div>
              </th>
              <th onClick={() => handleSort('network')}>
                <div className="th-content">
                  Network <SortIcon field="network" />
                </div>
              </th>
              <th onClick={() => handleSort('uptime')}>
                <div className="th-content">
                  Uptime <SortIcon field="uptime" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedHosts.map((host) => (
              <tr
                key={host.id}
                className={`host-row ${selectedHost?.id === host.id ? 'selected' : ''}`}
                onClick={() => onHostSelect(host)}
              >
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
            ))}
          </tbody>
        </table>
      </div>

      <div className="host-list-footer">
        Showing {filteredAndSortedHosts.length} of {hosts.length} hosts
      </div>
    </div>
  )
}
