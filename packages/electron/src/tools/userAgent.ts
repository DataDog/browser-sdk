import os from 'os'
import { app } from 'electron'

export function getUserAgent() {
  return [
    `${app.getName()}/${app.getVersion()}`,
    `(${getOSUserAgentPart()})`,
    `Electron/${process.versions.electron}`,
    `Chrome/${process.versions.chrome}`,
    `Node/${process.versions.node}`,
  ].join(' ')
}

// totally vibe coded
function getOSUserAgentPart() {
  const platform = os.platform() // 'darwin' | 'win32' | 'linux'
  const arch = os.arch() // 'x64', 'arm64', etc.

  if (platform === 'darwin') {
    // macOS version is kernel-style (e.g. '23.5.0')
    // Convert to marketing version (e.g. macOS 14.x.x)
    const version = os.release() // Darwin kernel version
    const darwinMajor = parseInt(version.split('.')[0], 10)

    // Darwin→macOS mapping: Darwin 23 → macOS 14, 22 → 13, 21 → 12, 20 → 11
    const macOSMajor = darwinMajor - 9

    // Browser uses underscore-separated
    const macOSVersionUA = `${macOSMajor}_0_0`

    return `Macintosh; Intel Mac OS X ${macOSVersionUA}`
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
