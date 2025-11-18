import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { datadogRum } from '@datadog/browser-rum'
import App from './App.tsx'

// Initialize Datadog RUM
datadogRum.init({
  applicationId: 'rum-application-id',
  clientToken: 'rum-client-token',
  site: 'datadoghq.com',
  service: 'react-shopist',
  env: 'local',
  version: '1.0.0',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  trackUserInteractions: true,
  trackResources: true,
  trackLongTasks: true,
  defaultPrivacyLevel: 'allow',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
