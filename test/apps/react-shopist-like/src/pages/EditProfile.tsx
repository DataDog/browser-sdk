import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function EditProfile() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    firstName: 'Doe',
    lastName: 'John',
    address: '4321 40th street',
    address2: '#2F',
    city: 'New York',
    state: 'NY',
    zipcode: '11101',
    phone: '601-494-9501',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically save the data
    navigate('/profile')
  }

  const handleCancel = () => {
    navigate('/profile')
  }

  return (
    <div className="main-content">
      <div className="edit-profile-page">
        <h1>Edit your profile</h1>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <label className="form-label">Profile picture</label>
            <div className="profile-picture-upload">
              <div className="profile-avatar-large">
                <svg viewBox="0 0 100 100" className="avatar-placeholder">
                  <circle cx="50" cy="50" r="50" fill="#cccccc" />
                  <circle cx="50" cy="40" r="15" fill="#999999" />
                  <path d="M 20 80 Q 20 60 50 60 Q 80 60 80 80" fill="#999999" />
                </svg>
              </div>
              <button type="button" className="upload-photo-button">
                UPLOAD PHOTO
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="firstName">
                Firstname
              </label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                className="form-input"
                value={formData.firstName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="lastName">
                Lastname
              </label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                className="form-input"
                value={formData.lastName}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="address">
              Address
            </label>
            <input
              type="text"
              id="address"
              name="address"
              className="form-input"
              value={formData.address}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="address2">
              Address 2
            </label>
            <input
              type="text"
              id="address2"
              name="address2"
              className="form-input"
              value={formData.address2}
              onChange={handleChange}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="city">
                City
              </label>
              <input
                type="text"
                id="city"
                name="city"
                className="form-input"
                value={formData.city}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="state">
                State
              </label>
              <select id="state" name="state" className="form-select" value={formData.state} onChange={handleChange}>
                <option value="NY">NY</option>
                <option value="CA">CA</option>
                <option value="TX">TX</option>
                <option value="FL">FL</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="zipcode">
                Zipcode
              </label>
              <input
                type="text"
                id="zipcode"
                name="zipcode"
                className="form-input"
                value={formData.zipcode}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="phone">
              Mobile phone number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              className="form-input"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-button" onClick={handleCancel}>
              CANCEL
            </button>
            <button type="submit" className="save-button">
              SAVE PROFILE
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
