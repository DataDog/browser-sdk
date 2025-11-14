import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { InfrastructureData, Host, HostStatus } from '../../types/data'
import HostMap from './HostMap'
import HostList from './HostList'
import HostDetails from './HostDetails'
import { generateHostMetrics } from '../../utils/generateMetrics'
import './Infrastructure.css'

export default function Infrastructure() {
  const { data, loading, error } = useData<InfrastructureData>('/data/infrastructure.json')
  const [selectedHost, setSelectedHost] = useState<Host | null>(null)
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
  const [statusFilter, setStatusFilter] = useState<HostStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const handleHostSelect = (host: Host) => {
    setSelectedHost(host)
  }

  const handleHostDeselect = () => {
    setSelectedHost(null)
  }

  const selectedHostMetrics = useMemo(() => {
    if (!selectedHost) return null

    // Generate metrics dynamically for the selected host
    return generateHostMetrics(selectedHost.id, 50)
  }, [selectedHost, data?.metrics])

  const filteredHosts = useMemo(() => {
    if (!data?.hosts) return []

    let filtered = data.hosts

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((host) => host.status === statusFilter)
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((host) => host.name.toLowerCase().includes(searchQuery.toLowerCase()))
    }

    return filtered
  }, [data?.hosts, statusFilter, searchQuery])

  const statusSummary = useMemo(() => {
    if (!data?.hosts) return { total: 0, healthy: 0, warning: 0, critical: 0 }

    return {
      total: data.hosts.length,
      healthy: data.hosts.filter((h) => h.status === 'healthy').length,
      warning: data.hosts.filter((h) => h.status === 'warning').length,
      critical: data.hosts.filter((h) => h.status === 'critical').length,
    }
  }, [data?.hosts])

  if (loading) {
    return (
      <div className="infrastructure">
        <div className="loading-state">Loading infrastructure...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="infrastructure">
        <div className="error-state">Error loading infrastructure: {error.message}</div>
      </div>
    )
  }

  if (!data?.hosts) {
    return (
      <div className="infrastructure">
        <div className="error-state">No infrastructure data available</div>
      </div>
    )
  }

  return (
    <div className="infrastructure">
      <div className="infrastructure-header">
        <div className="infrastructure-title">
          <h1>Infrastructure</h1>
          <div className="infrastructure-summary">
            <div className="summary-stat">
              <span className="stat-value">{statusSummary.total}</span>
              <span className="stat-label">Total Hosts</span>
            </div>
            <div className="summary-stat healthy">
              <span className="stat-value">{statusSummary.healthy}</span>
              <span className="stat-label">Healthy</span>
            </div>
            <div className="summary-stat warning">
              <span className="stat-value">{statusSummary.warning}</span>
              <span className="stat-label">Warning</span>
            </div>
            <div className="summary-stat critical">
              <span className="stat-value">{statusSummary.critical}</span>
              <span className="stat-label">Critical</span>
            </div>
          </div>
        </div>

        <div className="view-toggle">
          <button className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`} onClick={() => setViewMode('map')}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Map
          </button>
          <button className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
            List
          </button>
        </div>
      </div>

      <div className="infrastructure-content">
        <div className="infrastructure-main">
          {viewMode === 'map' ? (
            <HostMap
              hosts={data.hosts}
              filteredHosts={filteredHosts}
              selectedHost={selectedHost}
              onHostSelect={handleHostSelect}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          ) : (
            <HostList
              hosts={data.hosts}
              filteredHosts={filteredHosts}
              selectedHost={selectedHost}
              onHostSelect={handleHostSelect}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}
        </div>

        {selectedHost && (
          <div className="infrastructure-sidebar">
            {selectedHostMetrics ? (
              <HostDetails host={selectedHost} metrics={selectedHostMetrics} onClose={handleHostDeselect} />
            ) : (
              <div className="host-details-placeholder">
                <div className="placeholder-content">
                  <h3>{selectedHost.name}</h3>
                  <p>Detailed metrics not available for this host.</p>
                  <button className="close-btn" onClick={handleHostDeselect}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
