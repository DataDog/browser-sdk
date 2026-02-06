import { spawn } from 'node:child_process'

function getChromeBinaryPath(): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  } else if (platform === 'linux') {
    return 'google-chrome'
  } else if (platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
  throw new Error(`Unsupported platform: ${platform}`)
}

export function launchChrome(url: string): void {
  const chromePath = getChromeBinaryPath()
  const chromeArgs = ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', url]

  console.log('Launching Chrome headless...')
  const chromeProcess = spawn(chromePath, chromeArgs, {
    stdio: 'ignore',
    detached: false,
  })

  chromeProcess.on('error', (error) => {
    console.error('Failed to launch Chrome:', error.message)
    process.exit(1)
  })

  // Clean up Chrome process on exit
  process.on('exit', () => {
    chromeProcess.kill()
  })
}
