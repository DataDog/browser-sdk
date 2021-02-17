import { listenAction } from '../actions'
import { evaluateCodeInActiveTab } from '../utils'

listenAction('endSession', () => {
  evaluateCodeInActiveTab(() => {
    console.log('plop')
    document.cookie = '_dd_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })
})
