// The default eslint-plugin-import resolver does not support "exports" fields in package.json yet.
// Ignore the error until the default resolver supports it, or we switch to a different resolver.
// https://github.com/import-js/eslint-plugin-import/issues/1810
import '@mantine/core/styles.layer.css'

import './global.css'

import { createRoot } from 'react-dom/client'
import React from 'react'

import { App } from './components/app'
import { initMonitoring } from './monitoring'

mockDevtoolsApiForTests()

const main = document.createElement('main')
document.body.append(main)
const root = createRoot(main)
root.render(<App />)
initMonitoring()

/**
 * Allow to display the extension panel outside of chrome devtools for testing
 */
function mockDevtoolsApiForTests() {
  if (!chrome.devtools) {
    chrome.devtools = {
      inspectedWindow: {
        tabId: 0,
      },
    } as any
  }
}
