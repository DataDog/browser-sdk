import React, { useState, useCallback } from 'react'
import { LogFacets, LogLevel } from '../../types/data'
import { LogFilters } from './LogsExplorer'
import './FilterSidebar.css'

interface FilterSidebarProps {
  facets?: LogFacets
  filters: LogFilters
  onFilterChange: (filters: Partial<LogFilters>) => void
}

interface FilterSectionProps {
  title: string
  isCollapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}

function FilterSection({ title, isCollapsed, onToggle, children }: FilterSectionProps) {
  return (
    <div className="filter-section">
      <button className="filter-section-header" onClick={onToggle}>
        <span className="filter-section-title">{title}</span>
        <svg
          className={`filter-section-chevron ${isCollapsed ? 'collapsed' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {!isCollapsed && <div className="filter-section-content">{children}</div>}
    </div>
  )
}

interface CheckboxListProps {
  items: string[]
  selectedItems: string[]
  onSelectionChange: (selected: string[]) => void
  maxVisible?: number
}

function CheckboxList({ items, selectedItems, onSelectionChange, maxVisible = 10 }: CheckboxListProps) {
  const [showAll, setShowAll] = useState(false)
  const displayItems = showAll ? items : items.slice(0, maxVisible)
  const hasMore = items.length > maxVisible

  const handleToggle = useCallback(
    (item: string) => {
      const isSelected = selectedItems.includes(item)
      if (isSelected) {
        onSelectionChange(selectedItems.filter((i) => i !== item))
      } else {
        onSelectionChange([...selectedItems, item])
      }
    },
    [selectedItems, onSelectionChange]
  )

  const handleSelectAll = useCallback(() => {
    if (selectedItems.length === items.length) {
      onSelectionChange([])
    } else {
      onSelectionChange([...items])
    }
  }, [items, selectedItems, onSelectionChange])

  return (
    <div className="checkbox-list">
      <div className="checkbox-list-header">
        <button className="select-all-btn" onClick={handleSelectAll}>
          {selectedItems.length === items.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div className="checkbox-items">
        {displayItems.map((item) => (
          <label key={item} className="checkbox-item">
            <input type="checkbox" checked={selectedItems.includes(item)} onChange={() => handleToggle(item)} />
            <span className="checkbox-label">{item}</span>
          </label>
        ))}
      </div>

      {hasMore && (
        <button className="show-more-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show Less` : `Show ${items.length - maxVisible} More`}
        </button>
      )}
    </div>
  )
}

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  ERROR: '#ff5252',
  WARN: '#ffa726',
  INFO: '#42a5f5',
  DEBUG: '#66bb6a',
}

export default function FilterSidebar({ facets, filters, onFilterChange }: FilterSidebarProps) {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    levels: false,
    services: false,
    hosts: true,
  })

  const toggleSection = useCallback((section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }, [])

  const handleLevelsChange = useCallback(
    (levels: string[]) => {
      onFilterChange({ levels: levels as LogLevel[] })
    },
    [onFilterChange]
  )

  const handleServicesChange = useCallback(
    (services: string[]) => {
      onFilterChange({ services })
    },
    [onFilterChange]
  )

  const handleHostsChange = useCallback(
    (hosts: string[]) => {
      onFilterChange({ hosts })
    },
    [onFilterChange]
  )

  const clearAllFilters = useCallback(() => {
    onFilterChange({
      levels: [],
      services: [],
      hosts: [],
      search: '',
    })
  }, [onFilterChange])

  const hasActiveFilters =
    filters.levels.length > 0 ||
    filters.services.length > 0 ||
    filters.hosts.length > 0 ||
    (filters.search && filters.search.length > 0)

  if (!facets) {
    return (
      <div className="filter-sidebar">
        <div className="filter-loading">Loading filters...</div>
      </div>
    )
  }

  return (
    <div className="filter-sidebar">
      <div className="filter-header">
        <h3>Filters</h3>
        {hasActiveFilters && (
          <button className="clear-filters-btn" onClick={clearAllFilters}>
            Clear All
          </button>
        )}
      </div>

      <FilterSection title="Log Levels" isCollapsed={collapsedSections.levels} onToggle={() => toggleSection('levels')}>
        <div className="level-filters">
          {facets.levels.map((level) => (
            <label key={level} className="level-checkbox-item">
              <input
                type="checkbox"
                checked={filters.levels.includes(level)}
                onChange={() => {
                  const isSelected = filters.levels.includes(level)
                  if (isSelected) {
                    handleLevelsChange(filters.levels.filter((l) => l !== level))
                  } else {
                    handleLevelsChange([...filters.levels, level])
                  }
                }}
              />
              <span className="level-indicator" style={{ backgroundColor: LOG_LEVEL_COLORS[level] }} />
              <span className="level-label">{level}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="Services"
        isCollapsed={collapsedSections.services}
        onToggle={() => toggleSection('services')}
      >
        <CheckboxList
          items={facets.services}
          selectedItems={filters.services}
          onSelectionChange={handleServicesChange}
          maxVisible={8}
        />
      </FilterSection>

      <FilterSection title="Hosts" isCollapsed={collapsedSections.hosts} onToggle={() => toggleSection('hosts')}>
        <CheckboxList
          items={facets.hosts}
          selectedItems={filters.hosts}
          onSelectionChange={handleHostsChange}
          maxVisible={8}
        />
      </FilterSection>
    </div>
  )
}
