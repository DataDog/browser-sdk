import { Group, Checkbox, Badge, Button } from '@mantine/core'
import React from 'react'
import { sendAction } from '../actions'
import { useStore } from '../useStore'

export function ActionsTab() {
  const [{ useDevBundles, useRumSlim, logEventsFromRequests, devServerStatus, blockIntakeRequests }, setStore] =
    useStore()
  return (
    <Group direction="column" spacing="md" align="flex-start">
      <Group spacing="md" align="center">
        <Checkbox
          label="Use dev bundles"
          checked={useDevBundles}
          onChange={(e) => setStore({ useDevBundles: isChecked(e.target) })}
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
      />

      <Checkbox
        label="Log events"
        checked={logEventsFromRequests}
        onChange={(e) => setStore({ logEventsFromRequests: isChecked(e.target) })}
      />

      <Checkbox
        label="Block intake requests"
        checked={blockIntakeRequests}
        onChange={(e) => setStore({ blockIntakeRequests: isChecked(e.target) })}
      />

      <Button onClick={() => sendAction('flushEvents', undefined)}>Flush buffered events</Button>

      <Button onClick={() => sendAction('endSession', undefined)}>End current session</Button>
    </Group>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}
