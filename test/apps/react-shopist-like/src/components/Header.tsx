import { Link, useLocation } from 'react-router-dom'

interface HeaderProps {
  cartItemCount: number
  searchQuery: string
  onSearchChange: (query: string) => void
}

export function Header({ cartItemCount }: HeaderProps) {
  const location = useLocation()
  const currentCategory = location.pathname.slice(1).toLowerCase()

  return (
    <header className="header">
      <div className="header-wrapper">
        <Link to="/" className="logo">
          COUCH CACHE
        </Link>
        <div className="header-content">
          <div className="header-nav">
            <Link to="/chairs" className={`nav-link ${currentCategory === 'chairs' ? 'active' : ''}`}>
              CHAIRS
            </Link>
            <Link to="/sofas" className={`nav-link ${currentCategory === 'sofas' ? 'active' : ''}`}>
              SOFAS
            </Link>
            <Link to="/bedding" className={`nav-link ${currentCategory === 'bedding' ? 'active' : ''}`}>
              BEDDING
            </Link>
            <Link to="/lighting" className={`nav-link ${currentCategory === 'lighting' ? 'active' : ''}`}>
              LIGHTING
            </Link>
          </div>
          <div className="header-actions">
            <Link to="/profile" className="nav-link">
              MY PROFILE
            </Link>
            <Link to="/cart" className="nav-link">
              CART ({cartItemCount})
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}
