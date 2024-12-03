import { useEffect, useState } from 'react'
import { evalInWindow } from '../evalInWindow'
import { createLogger } from '../../common/logger'
import { ENVIRONMENTS } from './env'

const logger = createLogger('useSdkInfos')

export function useEnvInfo() {
  const [env, setEnv] = useState<Array<{ name: string; version: string }>>()

  useEffect(() => {
    evalInWindow(
      `
      function detectProperty(name) {
        if(!name) { return }

        const arr = [document.body]
        while(arr.length) {
          const node = arr.pop()

          for(const prop in node) {
            if(prop.startsWith(name)) {
              console.log(prop, node[prop])
              return node
            }
          }

          node.childNodes.forEach(child => {
            arr.push(child)
          });
        }
      }

      function detectAttribute(name) {
        if(!name) { return }

        return document.querySelector("*[" + name + "]")
      }


      function getEnvironment(name, property, attribute, getVersion) {
        const node = detectProperty(property) || detectAttribute(attribute)

        if (!node) { return }

        return {
          name: name,
          version: getVersion && getVersion(node)
        }
      }

      return [${ENVIRONMENTS?.map((env) => `getEnvironment("${env.name}", "${env.property}", "${env.attribute}", ${env.version})`).join(',')}]
              .filter(env => !!env)
      `
    )
      .then((res) => setEnv(res as any))
      .catch((err) => {
        logger.error('Error while getting application environment:', err)
      })

    return () => {}
  }, [setEnv])

  return env
}
