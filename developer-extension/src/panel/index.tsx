import { createRoot } from 'react-dom/client'
import React from 'react'

import { App } from './app'

const main = document.createElement('main')
document.body.append(main)
const root = createRoot(main)
root.render(<App />)
