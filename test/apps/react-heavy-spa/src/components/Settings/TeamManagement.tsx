import { useState, useCallback } from 'react'
import { TeamMember } from '../../types/data'
import './TeamManagement.css'

interface TeamManagementProps {
  initialTeam: TeamMember[]
  onUpdate: (team: TeamMember[]) => void
}

interface NewMemberForm {
  name: string
  email: string
  role: string
}

interface FormErrors {
  name?: string
  email?: string
}

const ROLES = ['Admin', 'Developer', 'Viewer', 'Manager']

export default function TeamManagement({ initialTeam, onUpdate }: TeamManagementProps) {
  const [team, setTeam] = useState<TeamMember[]>(initialTeam)
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [newMember, setNewMember] = useState<NewMemberForm>({
    name: '',
    email: '',
    role: 'Developer',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [removingId, setRemovingId] = useState<string | null>(null)

  const validateNewMember = useCallback((): boolean => {
    const errors: FormErrors = {}

    if (!newMember.name.trim()) {
      errors.name = 'Name is required'
    } else if (newMember.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters'
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!newMember.email.trim()) {
      errors.email = 'Email is required'
    } else if (!emailRegex.test(newMember.email)) {
      errors.email = 'Invalid email format'
    } else if (team.some((member) => member.email.toLowerCase() === newMember.email.toLowerCase())) {
      errors.email = 'This email is already in the team'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }, [newMember, team])

  const handleAddMember = useCallback(() => {
    if (!validateNewMember()) {
      return
    }

    const member: TeamMember = {
      id: `member-${Date.now()}`,
      name: newMember.name.trim(),
      email: newMember.email.trim().toLowerCase(),
      role: newMember.role,
    }

    const updatedTeam = [...team, member]
    setTeam(updatedTeam)
    onUpdate(updatedTeam)

    // Reset form
    setNewMember({ name: '', email: '', role: 'Developer' })
    setFormErrors({})
    setIsAddingMember(false)
  }, [newMember, team, onUpdate, validateNewMember])

  const handleRemoveMember = useCallback(
    (id: string) => {
      setRemovingId(id)

      // Animate removal
      setTimeout(() => {
        const updatedTeam = team.filter((member) => member.id !== id)
        setTeam(updatedTeam)
        onUpdate(updatedTeam)
        setRemovingId(null)
      }, 300)
    },
    [team, onUpdate]
  )

  const handleUpdateRole = useCallback(
    (id: string, newRole: string) => {
      const updatedTeam = team.map((member) => (member.id === id ? { ...member, role: newRole } : member))
      setTeam(updatedTeam)
      onUpdate(updatedTeam)
    },
    [team, onUpdate]
  )

  const handleCancelAdd = useCallback(() => {
    setIsAddingMember(false)
    setNewMember({ name: '', email: '', role: 'Developer' })
    setFormErrors({})
  }, [])

  const handleInputChange = useCallback(
    (field: keyof NewMemberForm, value: string) => {
      setNewMember((prev) => ({ ...prev, [field]: value }))
      if (formErrors[field as keyof FormErrors]) {
        setFormErrors((prev) => ({ ...prev, [field]: undefined }))
      }
    },
    [formErrors]
  )

  return (
    <div className="team-management">
      <div className="team-header">
        <div>
          <h2>Team Management</h2>
          <p>Manage team members and their roles</p>
        </div>
        {!isAddingMember && (
          <button className="btn btn-primary" onClick={() => setIsAddingMember(true)}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
            </svg>
            Add Member
          </button>
        )}
      </div>

      {isAddingMember && (
        <div className="add-member-form">
          <h3>Add New Team Member</h3>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="member-name" className="form-label">
                Name <span className="required">*</span>
              </label>
              <input
                id="member-name"
                type="text"
                className={`form-input ${formErrors.name ? 'error' : ''}`}
                value={newMember.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="John Doe"
              />
              {formErrors.name && <span className="error-message">{formErrors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="member-email" className="form-label">
                Email <span className="required">*</span>
              </label>
              <input
                id="member-email"
                type="email"
                className={`form-input ${formErrors.email ? 'error' : ''}`}
                value={newMember.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="john.doe@example.com"
              />
              {formErrors.email && <span className="error-message">{formErrors.email}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="member-role" className="form-label">
                Role
              </label>
              <select
                id="member-role"
                className="form-select"
                value={newMember.role}
                onChange={(e) => handleInputChange('role', e.target.value)}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={handleCancelAdd}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAddMember}>
              Add Member
            </button>
          </div>
        </div>
      )}

      <div className="team-list">
        <div className="team-list-header">
          <span className="team-count">{team.length} team members</span>
        </div>

        {team.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            <p>No team members yet</p>
            <button className="btn btn-primary" onClick={() => setIsAddingMember(true)}>
              Add Your First Member
            </button>
          </div>
        ) : (
          <div className="team-members">
            {team.map((member) => (
              <div key={member.id} className={`team-member ${removingId === member.id ? 'removing' : ''}`}>
                <div className="member-avatar">{member.name.charAt(0).toUpperCase()}</div>
                <div className="member-info">
                  <h4>{member.name}</h4>
                  <p>{member.email}</p>
                </div>
                <div className="member-role">
                  <select
                    className="role-select"
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="remove-btn"
                  onClick={() => handleRemoveMember(member.id)}
                  aria-label={`Remove ${member.name}`}
                  title="Remove member"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
