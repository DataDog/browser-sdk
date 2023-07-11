import { createRoot } from 'react-dom/client'
import React from 'react'

import { App } from './components/app'
import { initMonitoring } from './monitoring'

const main = document.createElement('main')
document.body.append(main)
const root = createRoot(main)
root.render(<App />)
initMonitoring()
