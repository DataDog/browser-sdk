import { app, BrowserWindow } from 'electron'
import { ddElectron } from '@datadog/electron'

// Delay startup to not miss early logs in playwright
setTimeout(startApp, 200)

function startApp() {
  ddElectron.init(retrieveRumConfiguration())

  app.whenReady().then(() => {
    createWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
  })

  win.loadFile('index.html')
}

function retrieveRumConfiguration(): any {
  const namespace = 'RUM_'
  const rumConfiguration = {}
  Object.entries(process.env)
    .filter(([key]) => key.startsWith(namespace))
    .forEach(([key, value]) => {
      rumConfiguration[key.replace(namespace, '')] = Number.isNaN(Number(value)) ? value : Number(value)
    })
  return rumConfiguration
}
