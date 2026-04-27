import { useState, useCallback } from 'react'
import { Integration } from '../../types/data'
import './Integrations.css'

interface IntegrationsProps {
  initialIntegrations: Integration[]
  onUpdate: (integrations: Integration[]) => void
}

const INTEGRATION_ICONS: Record<string, string> = {
  slack: '💬',
  github: '🐙',
  jira: '📋',
  pagerduty: '🚨',
  datadog: '🐶',
  aws: '☁️',
  gcp: '🌩️',
  azure: '🔷',
  stripe: '💳',
  sendgrid: '📧',
  twilio: '📱',
  postgres: '🐘',
}

export default function Integrations({ initialIntegrations, onUpdate }: IntegrationsProps) {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggle = useCallback(
    async (id: string) => {
      setTogglingId(id)

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500))

      const updatedIntegrations = integrations.map((integration) =>
        integration.id === id ? { ...integration, enabled: !integration.enabled } : integration
      )

      setIntegrations(updatedIntegrations)
      onUpdate(updatedIntegrations)
      setTogglingId(null)
    },
    [integrations, onUpdate]
  )

  const enabledCount = integrations.filter((i) => i.enabled).length

  return (
    <div className="integrations">
      <div className="integrations-header">
        <div>
          <h2>Integrations</h2>
          <p>Connect and manage third-party services</p>
        </div>
        <div className="integrations-stats">
          <span className="stat-value">{enabledCount}</span>
          <span className="stat-label">of {integrations.length} enabled</span>
        </div>
      </div>

      <div className="integrations-grid">
        {integrations.map((integration) => (
          <div
            key={integration.id}
            className={`integration-card ${integration.enabled ? 'enabled' : 'disabled'} ${
              togglingId === integration.id ? 'toggling' : ''
            }`}
          >
            <div className="integration-header">
              <div className="integration-icon">{INTEGRATION_ICONS[integration.id] || '🔌'}</div>
              <div className="integration-status">
                <span className={`status-dot ${integration.enabled ? 'active' : ''}`} />
                <span className="status-text">{integration.enabled ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>

            <div className="integration-body">
              <h3>{integration.name}</h3>
              <p className="integration-type">{integration.type}</p>
            </div>

            <div className="integration-footer">
              <button
                className={`toggle-btn ${integration.enabled ? 'disconnect' : 'connect'}`}
                onClick={() => handleToggle(integration.id)}
                disabled={togglingId === integration.id}
              >
                {togglingId === integration.id ? (
                  <>
                    <span className="spinner" />
                    {integration.enabled ? 'Disconnecting...' : 'Connecting...'}
                  </>
                ) : (
                  <>
                    {integration.enabled ? (
                      <>
                        <svg viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Disconnect
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Connect
                      </>
                    )}
                  </>
                )}
              </button>

              {integration.enabled && (
                <button className="settings-btn" title="Configure integration" aria-label="Configure integration">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
