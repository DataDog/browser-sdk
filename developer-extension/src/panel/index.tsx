// The default eslint-plugin-import resolver does not support "exports" fields in package.json yet.
// Ignore the error until the default resolver supports it, or we switch to a different resolver.
// https://github.com/import-js/eslint-plugin-import/issues/1810
// eslint-disable-next-line import/no-unresolved
import '@mantine/core/styles.layer.css'

import './global.css'

import { createRoot } from 'react-dom/client'
import React from 'react'

import { App } from './components/app'
import { initMonitoring } from './monitoring'

const main = document.createElement('main')
document.body.append(main)
const root = createRoot(main)
root.render(<App />)
initMonitoring()
