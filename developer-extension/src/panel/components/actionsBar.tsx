import { Group, Checkbox, Badge, Button } from '@mantine/core'
import React from 'react'
import { sendAction } from '../actions'
import { useStore } from '../hooks/useStore'

export function ActionsBar() {
  const [{ useDevBundles, useRumSlim, devServerStatus, blockIntakeRequests }, setStore] = useStore()
  return (
    <Group direction="row" spacing="md" align="flex-start">
      <Group spacing="md" align="center">
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

      <Button color="violet" variant="light" compact onClick={() => sendAction('flushEvents', undefined)}>
        Flush buffered events
      </Button>

      <Button color="violet" variant="light" compact onClick={() => sendAction('endSession', undefined)}>
        End current session
      </Button>
    </Group>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}
