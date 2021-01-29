import { render } from 'react-dom'
import React from 'react'

import { App } from './app'

const main = document.createElement('main')
document.body.append(main)
render(<App />, main)
