import { useState, useCallback } from 'react'
import { UserSettings as UserSettingsType, TeamMember, Integration } from '../../types/data'
import UserSettings from './UserSettings'
import TeamManagement from './TeamManagement'
import Integrations from './Integrations'
import './Settings.css'

// Mock initial data
const INITIAL_USER_SETTINGS: UserSettingsType = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  role: 'Admin',
  notifications: true,
  timezone: 'America/New_York',
}

const INITIAL_TEAM: TeamMember[] = [
  {
    id: 'member-1',
    name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    role: 'Developer',
  },
  {
    id: 'member-2',
    name: 'Bob Smith',
    email: 'bob.smith@example.com',
    role: 'Developer',
  },
  {
    id: 'member-3',
    name: 'Carol Williams',
    email: 'carol.williams@example.com',
    role: 'Manager',
  },
  {
    id: 'member-4',
    name: 'David Brown',
    email: 'david.brown@example.com',
    role: 'Viewer',
  },
]

const INITIAL_INTEGRATIONS: Integration[] = [
  { id: 'slack', name: 'Slack', enabled: true, type: 'communication' },
  { id: 'github', name: 'GitHub', enabled: true, type: 'version control' },
  { id: 'jira', name: 'Jira', enabled: true, type: 'project management' },
  { id: 'pagerduty', name: 'PagerDuty', enabled: false, type: 'incident management' },
  { id: 'datadog', name: 'Datadog', enabled: true, type: 'monitoring' },
  { id: 'aws', name: 'Amazon Web Services', enabled: true, type: 'cloud provider' },
  { id: 'gcp', name: 'Google Cloud Platform', enabled: false, type: 'cloud provider' },
  { id: 'azure', name: 'Microsoft Azure', enabled: false, type: 'cloud provider' },
  { id: 'stripe', name: 'Stripe', enabled: true, type: 'payment' },
  { id: 'sendgrid', name: 'SendGrid', enabled: true, type: 'email' },
  { id: 'twilio', name: 'Twilio', enabled: false, type: 'sms' },
  { id: 'postgres', name: 'PostgreSQL', enabled: true, type: 'database' },
]

type TabType = 'user' | 'team' | 'integrations'

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabType>('user')
  const [userSettings, setUserSettings] = useState<UserSettingsType>(INITIAL_USER_SETTINGS)
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM)
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS)

  const handleUserSettingsSave = useCallback((settings: UserSettingsType) => {
    setUserSettings(settings)
    console.log('User settings saved:', settings)
  }, [])

  const handleTeamUpdate = useCallback((updatedTeam: TeamMember[]) => {
    setTeam(updatedTeam)
    console.log('Team updated:', updatedTeam)
  }, [])

  const handleIntegrationsUpdate = useCallback((updatedIntegrations: Integration[]) => {
    setIntegrations(updatedIntegrations)
    console.log('Integrations updated:', updatedIntegrations)
  }, [])

  return (
    <div className="settings">
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your account, team, and integrations</p>
      </div>

      <div className="settings-tabs">
        <button className={`tab-button ${activeTab === 'user' ? 'active' : ''}`} onClick={() => setActiveTab('user')}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          User Settings
        </button>
        <button className={`tab-button ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
          Team
          <span className="tab-badge">{team.length}</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
              clipRule="evenodd"
            />
          </svg>
          Integrations
          <span className="tab-badge">{integrations.filter((i) => i.enabled).length}</span>
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'user' && <UserSettings initialSettings={userSettings} onSave={handleUserSettingsSave} />}
        {activeTab === 'team' && <TeamManagement initialTeam={team} onUpdate={handleTeamUpdate} />}
        {activeTab === 'integrations' && (
          <Integrations initialIntegrations={integrations} onUpdate={handleIntegrationsUpdate} />
        )}
      </div>
    </div>
  )
}
