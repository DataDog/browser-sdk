import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
import App from './App.tsx'

datadogRum.init({
  applicationId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  clientToken: 'pubxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  site: 'datadoghq.com',
  service: 'react-shopist',
  sessionSampleRate: 100,
  profilingSampleRate: 100,
  compressIntakeRequests: false,
  trackUserInteractions: true,
  plugins: [reactPlugin()],
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
