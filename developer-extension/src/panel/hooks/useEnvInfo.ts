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
      function getProperty(name) {
        if(!name) { return }

        const arr = [document.body]
        while(arr.length) {
          const node = arr.pop()

          for(const prop in node) {
            if(prop.startsWith(name)) {
              return node
            }
          }

          node.childNodes.forEach(child => {
            arr.push(child)
          });
        }
      }

      function getAttribute(name) {
        if(!name) { return }

        return document.querySelector("*[" + name + "]")
      }

      function getObject(name) {
        if(!name) { return }

        return window[name]
      }

      function getEnvironment(name, property, attribute, object, getVersion) {
        const target = getProperty(property) || getAttribute(attribute) || getObject(object)

        if (!target) { return }

        return {
          name: name,
          version: getVersion && getVersion(target)
        }
      }

      return [${ENVIRONMENTS?.map((env) => `getEnvironment("${env.name}", "${env.property ?? ''}", "${env.attribute ?? ''}", "${env.object ?? ''}", ${env.version})`).join(',')}]
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
