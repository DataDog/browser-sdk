import { useState, useCallback } from 'react'
import { UserSettings as UserSettingsType } from '../../types/data'
import './UserSettings.css'

interface UserSettingsProps {
  initialSettings: UserSettingsType
  onSave: (settings: UserSettingsType) => void
}

interface ValidationErrors {
  name?: string
  email?: string
  timezone?: string
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
]

const ROLES = ['Admin', 'Developer', 'Viewer', 'Manager']

export default function UserSettings({ initialSettings, onSave }: UserSettingsProps) {
  const [settings, setSettings] = useState<UserSettingsType>(initialSettings)
  const [errors, setErrors] = useState<ValidationErrors>({})
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const validateForm = useCallback((): boolean => {
    const newErrors: ValidationErrors = {}

    // Name validation
    if (!settings.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (settings.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!settings.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!emailRegex.test(settings.email)) {
      newErrors.email = 'Invalid email format'
    }

    // Timezone validation
    if (!settings.timezone) {
      newErrors.timezone = 'Timezone is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [settings])

  const handleInputChange = useCallback(
    (field: keyof UserSettingsType, value: string | boolean) => {
      setSettings((prev) => ({ ...prev, [field]: value }))
      setIsDirty(true)
      setSaveSuccess(false)

      // Clear error for this field when user starts typing
      if (errors[field as keyof ValidationErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }))
      }
    },
    [errors]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!validateForm()) {
        return
      }

      setIsSaving(true)

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800))

      onSave(settings)
      setIsSaving(false)
      setIsDirty(false)
      setSaveSuccess(true)

      // Hide success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000)
    },
    [settings, validateForm, onSave]
  )

  const handleReset = useCallback(() => {
    setSettings(initialSettings)
    setErrors({})
    setIsDirty(false)
    setSaveSuccess(false)
  }, [initialSettings])

  return (
    <div className="user-settings">
      <div className="user-settings-header">
        <h2>User Settings</h2>
        <p>Manage your account settings and preferences</p>
      </div>

      <form className="user-settings-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name" className="form-label">
            Full Name <span className="required">*</span>
          </label>
          <input
            id="name"
            type="text"
            className={`form-input ${errors.name ? 'error' : ''}`}
            value={settings.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Enter your full name"
          />
          {errors.name && <span className="error-message">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="email" className="form-label">
            Email Address <span className="required">*</span>
          </label>
          <input
            id="email"
            type="email"
            className={`form-input ${errors.email ? 'error' : ''}`}
            value={settings.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="your.email@example.com"
          />
          {errors.email && <span className="error-message">{errors.email}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="role" className="form-label">
            Role
          </label>
          <select
            id="role"
            className="form-select"
            value={settings.role}
            onChange={(e) => handleInputChange('role', e.target.value)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="timezone" className="form-label">
            Timezone <span className="required">*</span>
          </label>
          <select
            id="timezone"
            className={`form-select ${errors.timezone ? 'error' : ''}`}
            value={settings.timezone}
            onChange={(e) => handleInputChange('timezone', e.target.value)}
          >
            <option value="">Select a timezone</option>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          {errors.timezone && <span className="error-message">{errors.timezone}</span>}
        </div>

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={settings.notifications}
              onChange={(e) => handleInputChange('notifications', e.target.checked)}
            />
            <span>Enable email notifications</span>
          </label>
          <p className="checkbox-description">
            Receive email notifications for system alerts, reports, and team updates
          </p>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleReset} disabled={!isDirty || isSaving}>
            Reset
          </button>
          <button type="submit" className="btn btn-primary" disabled={!isDirty || isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {saveSuccess && (
          <div className="save-success">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            Settings saved successfully!
          </div>
        )}
      </form>
    </div>
  )
}
