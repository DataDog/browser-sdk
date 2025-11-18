import { ReactNode } from 'react'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import './MainLayout.css'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="main-layout">
      <TopBar />
      <div className="layout-container">
        <Sidebar />
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}
