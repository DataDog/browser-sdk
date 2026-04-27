import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import Dashboard from './components/Dashboard/Dashboard'
import LogsExplorer from './components/Logs/LogsExplorer'
import Infrastructure from './components/Infrastructure/Infrastructure'
import Settings from './components/Settings/Settings'
import { ROUTES } from './utils/constants'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path={ROUTES.DASHBOARD} element={<Dashboard />} />
          <Route path={ROUTES.LOGS} element={<LogsExplorer />} />
          <Route path={ROUTES.INFRASTRUCTURE} element={<Infrastructure />} />
          <Route path={ROUTES.SETTINGS} element={<Settings />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  )
}

export default App
