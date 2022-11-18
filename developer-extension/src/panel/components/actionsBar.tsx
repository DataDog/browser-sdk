import { Group, Checkbox, Badge, Button } from '@mantine/core'
import React, { useState } from 'react'
import { evalInWindow } from '../evalInWindow'
import { flushEvents } from '../flushEvents'
import { useStore } from '../hooks/useStore'
import { useAutoFlushEvents } from '../hooks/useAutoFlushEvents'

export function ActionsBar() {
  const [{ useDevBundles, useRumSlim, devServerStatus, blockIntakeRequests }, setStore] = useStore()
  const [autoFlush, setAutoFlush] = useState<boolean>(true)

  useAutoFlushEvents(autoFlush)

  return (
    <Group>
      <Group>
        <Group spacing="sm">
          <Checkbox
            label="Use dev bundles"
            checked={useDevBundles}
            onChange={(e) => setStore({ useDevBundles: isChecked(e.target) })}
            color="violet"
          />
          {devServerStatus === 'available' ? (
            <Badge color="green">Available</Badge>
          ) : devServerStatus === 'checking' ? (
            <Badge color="yellow">Checking...</Badge>
          ) : (
            <Badge color="red">Unavailable</Badge>
          )}
        </Group>
        <Checkbox
          label="Use RUM Slim"
          checked={useRumSlim}
          onChange={(e) => setStore({ useRumSlim: isChecked(e.target) })}
          color="violet"
        />
        <Checkbox
          label="Block intake requests"
          checked={blockIntakeRequests}
          onChange={(e) => setStore({ blockIntakeRequests: isChecked(e.target) })}
          color="violet"
        />
      </Group>
      <Group>
        <Checkbox label="Auto Flush" checked={autoFlush} onChange={() => setAutoFlush((b) => !b)} color="violet" />
        <Button color="violet" variant="light" compact onClick={() => flushEvents()}>
          Flush buffered events
        </Button>
        <Button color="violet" variant="light" compact onClick={() => endSession()}>
          End current session
        </Button>
      </Group>
    </Group>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}

function endSession() {
  evalInWindow(
    `
      document.cookie = '_dd_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    `
  ).catch((error) => console.error('Error while ending session:', error))
}
