import { Group, Checkbox, Badge, Button } from '@mantine/core'
import React from 'react'
import { evalInWindow } from '../evalInWindow'
import { useStore } from '../hooks/useStore'

export function ActionsBar() {
  const [{ useDevBundles, useRumSlim, devServerStatus, blockIntakeRequests }, setStore] = useStore()
  return (
    <Group direction="row">
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
      <Button color="violet" variant="light" compact onClick={() => flushEvents()}>
        Flush buffered events
      </Button>
      <Button color="violet" variant="light" compact onClick={() => endSession()}>
        End current session
      </Button>
    </Group>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}

function flushEvents() {
  evalInWindow(
    `
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')
      console.log(descriptor)
      Object.defineProperty(Document.prototype, 'visibilityState', { value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
      Object.defineProperty(Document.prototype, 'visibilityState', descriptor)
      document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    `
  ).catch((error) => console.error('Error while flushing events:', error))
}

function endSession() {
  evalInWindow(
    `
      document.cookie = '_dd_s=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    `
  ).catch((error) => console.error('Error while ending session:', error))
}
