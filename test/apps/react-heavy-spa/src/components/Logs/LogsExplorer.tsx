import { useState, useMemo } from 'react'
import { useData } from '../../hooks/useData'
import { LogEntry, LogsData, LogLevel } from '../../types/data'
import { heavyComputation } from '../../utils/performanceThrottle'
import SearchBar from './SearchBar'
import FilterSidebar from './FilterSidebar'
import LogTable from './LogTable'
import LogDetails from './LogDetails'
import './LogsExplorer.css'

export interface LogFilters {
  levels: LogLevel[]
  services: string[]
  hosts: string[]
  search: string
}

export default function LogsExplorer() {
  const { data, loading, error } = useData<LogsData>('/data/logs.json')
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [filters, setFilters] = useState<LogFilters>({
    levels: [],
    services: [],
    hosts: [],
    search: '',
  })

  // Filter logs based on current filters
  const filteredLogs = useMemo(() => {
    if (!data?.logs) return []

    const results = data.logs.filter((log) => {
      // Level filter
      if (filters.levels.length > 0 && !filters.levels.includes(log.level)) {
        return false
      }

      // Service filter
      if (filters.services.length > 0 && !filters.services.includes(log.service)) {
        return false
      }

      // Host filter
      if (filters.hosts.length > 0 && !filters.hosts.includes(log.host)) {
        return false
      }

      // Search filter
      if (filters.search && !log.message.toLowerCase().includes(filters.search.toLowerCase())) {
        return false
      }

      return true
    })

    return heavyComputation(results, 100)
  }, [data?.logs, filters])

  const handleFilterChange = (newFilters: Partial<LogFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }))
  }

  const handleLogSelect = (log: LogEntry) => {
    setSelectedLog(log)
  }

  const handleLogDeselect = () => {
    setSelectedLog(null)
  }

  if (loading) {
    return (
      <div className="logs-explorer">
        <div className="loading-state">Loading logs...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="logs-explorer">
        <div className="error-state">Error loading logs: {error.message}</div>
      </div>
    )
  }

  return (
    <div className="logs-explorer">
      <div className="logs-header">
        <h1>Logs Explorer</h1>
        <div className="logs-stats">
          {filteredLogs.length} of {data?.logs?.length || 0} logs
        </div>
      </div>

      <SearchBar
        value={filters.search}
        onChange={(search) => handleFilterChange({ search })}
        placeholder="Search log messages..."
      />

      <div className="logs-content">
        <FilterSidebar facets={data?.facets} filters={filters} onFilterChange={handleFilterChange} />

        <div className="logs-main">
          <LogTable logs={filteredLogs} selectedLog={selectedLog} onLogSelect={handleLogSelect} />

          {selectedLog && <LogDetails log={selectedLog} onClose={handleLogDeselect} />}
        </div>
      </div>
    </div>
  )
}
