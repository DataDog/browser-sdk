import os from 'os'
import { execSync } from 'node:child_process'
import { app } from 'electron'

let userAgent: string | undefined

export function getUserAgent() {
  if (!userAgent) {
    userAgent = [
      `${app.getName()}/${app.getVersion()}`,
      `(${getOSUserAgentPart()})`,
      `Electron/${process.versions.electron}`,
      `Chrome/${process.versions.chrome}`,
      `Node/${process.versions.node}`,
    ].join(' ')
  }
  return userAgent
}

// totally vibe coded
function getOSUserAgentPart() {
  const platform = os.platform() // 'darwin' | 'win32' | 'linux'
  const arch = os.arch() // 'x64', 'arm64', etc.

  if (platform === 'darwin') {
    let version = execSync('sw_vers -productVersion', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    if (version.split('.').length === 2) {
      // If macOS has no patch yet, we get: major.minor only
      version += '.0'
    }

    return `Macintosh; Intel Mac OS X ${version.replace('.', '_')}`
  }

  if (platform === 'win32') {
    // Map kernels to Windows versions
    // Windows 10 → NT 10.0
    // Windows 11 → NT 10.0 (yes, same NT version!)
    const ntVersion = '10.0'

    const archUA = arch === 'x64' || arch === 'arm64' ? 'Win64; x64' : arch
    return `Windows NT ${ntVersion}; ${archUA}`
  }

  // Generic Linux
  if (platform === 'linux') {
    const archUA = arch === 'x64' ? 'x86_64' : arch === 'arm64' ? 'aarch64' : arch

    return `X11; Linux ${archUA}`
  }

  // fallback
  return `${platform}; ${arch}`
}
