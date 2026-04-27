import { useNavigate } from 'react-router-dom'

export function Profile() {
  const navigate = useNavigate()

  return (
    <div className="main-content">
      <div className="profile-page">
        <div className="profile-header">
          <div className="profile-avatar">
            <svg viewBox="0 0 100 100" className="avatar-placeholder">
              <circle cx="50" cy="50" r="50" fill="#cccccc" />
              <circle cx="50" cy="40" r="15" fill="#999999" />
              <path d="M 20 80 Q 20 60 50 60 Q 80 60 80 80" fill="#999999" />
            </svg>
          </div>
          <div className="profile-name">
            <h1>Doe John</h1>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">Shipping address</div>
          <div className="profile-section-content">
            <div>4321 40th street</div>
            <div>#2F</div>
            <div>New York, NY, 11101</div>
          </div>
        </div>

        <div className="profile-section">
          <div className="profile-section-label">Phone</div>
          <div className="profile-section-content">
            <div>601-494-9501</div>
          </div>
        </div>

        <button className="edit-profile-button" onClick={() => navigate('/profile/edit')}>
          EDIT PROFILE
        </button>
      </div>
    </div>
  )
}
