import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ROUTES } from '../../utils/constants'
import './TopBar.css'

export default function TopBar() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [notificationCount, setNotificationCount] = useState(3)

  const [searchParams] = useSearchParams()
  const queryString = searchParams.toString()

  const homeLink = queryString ? `${ROUTES.DASHBOARD}?${queryString}` : ROUTES.DASHBOARD

  // Simulate heavy computation to emulate poor INP
  const heavyComputation = () => {
    const startTime = performance.now()
    let result = 0

    // Block main thread for ~200-300ms to simulate heavy work
    while (performance.now() - startTime < 250) {
      result += Math.random() * Math.random()
    }

    // Additional DOM manipulation work
    const tempElements: HTMLElement[] = []
    for (let i = 0; i < 100; i++) {
      const div = document.createElement('div')
      div.textContent = `Item ${i}`
      div.style.display = 'none'
      tempElements.push(div)
    }

    return result
  }

  const handleNotificationClick = () => {
    // Emulate heavy work that causes poor INP
    heavyComputation()

    // Toggle notifications panel
    setShowNotifications(!showNotifications)

    // Clear notification count when opening
    if (!showNotifications) {
      setNotificationCount(0)
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to={homeLink} className="logo">
          <span className="logo-icon">📊</span>
          <span className="logo-text">Heavy SPA Benchmark</span>
        </Link>
      </div>

      <div className="topbar-center">
        <div className="search-bar">
          <input type="text" placeholder="Search..." className="search-input" />
        </div>
      </div>

      <div className="topbar-right">
        <div className="sdk-indicator"></div>
        <div className="notification-wrapper">
          <button className="icon-button notification-button" onClick={handleNotificationClick}>
            🔔
            {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
          </button>
          {showNotifications && (
            <div className="notification-panel">
              <div className="notification-header">
                <h3>Notifications</h3>
              </div>
              <div className="notification-list">
                <div className="notification-item">
                  <div className="notification-icon">📊</div>
                  <div className="notification-content">
                    <div className="notification-title">New dashboard available</div>
                    <div className="notification-time">2 minutes ago</div>
                  </div>
                </div>
                <div className="notification-item">
                  <div className="notification-icon">⚠️</div>
                  <div className="notification-content">
                    <div className="notification-title">High memory usage detected</div>
                    <div className="notification-time">15 minutes ago</div>
                  </div>
                </div>
                <div className="notification-item">
                  <div className="notification-icon">✅</div>
                  <div className="notification-content">
                    <div className="notification-title">Performance test completed</div>
                    <div className="notification-time">1 hour ago</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <button className="icon-button user-button">👤</button>
      </div>
    </header>
  )
}
