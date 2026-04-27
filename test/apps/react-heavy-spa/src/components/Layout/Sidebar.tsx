import { NavLink, useSearchParams } from 'react-router-dom'
import { ROUTES } from '../../utils/constants'
import './Sidebar.css'

interface NavItem {
  path: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: '📊' },
  { path: ROUTES.LOGS, label: 'Logs', icon: '📝' },
  { path: ROUTES.INFRASTRUCTURE, label: 'Infrastructure', icon: '🖥️' },
  { path: ROUTES.SETTINGS, label: 'Settings', icon: '⚙️' },
]

export default function Sidebar() {
  const [searchParams] = useSearchParams()
  const queryString = searchParams.toString()

  return (
    <nav className="sidebar">
      <ul className="nav-list">
        {NAV_ITEMS.map((item) => {
          const pathWithParams = queryString ? `${item.path}?${queryString}` : item.path

          return (
            <li key={item.path}>
              <NavLink
                to={pathWithParams}
                className={({ isActive }) => (isActive ? 'nav-link nav-link-active' : 'nav-link')}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
