import { listenAction } from '../actions'
import { DEV_LOGS_URL } from '../constants'
import { setStore } from '../store'

listenAction('getStore', () => {
  refreshDevServerStatus().catch((error) =>
    console.error('refreshDevServerStatus: Unexpected error while refreshing dev server status:', error)
  )
})

async function refreshDevServerStatus() {
  const timeoutId = setTimeout(() => setStore({ devServerStatus: 'checking' }), 500)
  let isAvailable = false
  try {
    const response = await fetch(DEV_LOGS_URL, { method: 'HEAD' })
    isAvailable = response.status === 200
  } catch {
    // The request can fail if nothing is listening on the URL port. In this case, consider the dev
    // server 'unavailable'.
  }
  clearTimeout(timeoutId)
  setStore({ devServerStatus: isAvailable ? 'available' : 'unavailable' })
}
