import { useEffect, useState } from 'react'
import { evalInWindow } from '../evalInWindow'
import { createLogger } from '../../common/logger'

const logger = createLogger('useSdkInfos')

export function useEnvInfo() {
  const [env, setEnv] = useState<string>('')

  useEffect(() => {
    evalInWindow(
      `
      function detectProperty(name) {
        const arr = [document.body]
        while(arr.length) {
          const node = arr.pop()

          for(const prop in node) {
            if(prop.startsWith(name)) {
              return true
            }
          }

          node.childNodes.forEach(child => {
            arr.push(child)
          });
        }
      }

      function detectAttribute(name) {
        return !!document.querySelector("*[" + name + "]")
      }

      function detectReact() {
        return detectProperty("__reactContainer")
      }

      function detectSvelte() {
        return detectProperty("__svelte")    
      }

      function detectAngular() {
        return detectAttribute("ng-version")
      }

      function detectVue() {
        return detectAttribute("data-v-app")
      }

      if(detectReact()) {
        return "React"
      } else if(detectAngular()) {
        return "Angular"
      } else if(detectVue()) {
       return "Vue"
      } else if(detectSvelte()) {
       return "Svelte"
      }
      `
    )
      .then((res) => setEnv(res as string))
      .catch((err) => {
        logger.error('Error while getting application environment:', err)
      })

    return () => {}
  }, [setEnv])

  return env
}
