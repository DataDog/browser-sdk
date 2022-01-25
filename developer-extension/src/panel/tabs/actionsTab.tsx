import { Stack, Checkbox, Badge, Button } from 'bumbag'
import React from 'react'
import { sendAction } from '../actions'
import { useStore } from '../useStore'

export function ActionsTab() {
  const [{ useDevBundles, useRumSlim, logEventsFromRequests, devServerStatus, blockIntakeRequests }, setStore] =
    useStore()
  return (
    <Stack alignY="top" padding="major-2" spacing="major-2">
      <Stack orientation="horizontal" verticalBelow="0" spacing="major-2" alignX="left" alignY="center">
        <Checkbox
          label="Use dev bundles"
          checked={useDevBundles}
          onChange={(e) => setStore({ useDevBundles: isChecked(e.target) })}
        />
        <Badge
          palette={devServerStatus === 'available' ? 'success' : devServerStatus === 'checking' ? 'warning' : 'danger'}
        />
      </Stack>

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
    </Stack>
  )
}

function isChecked(target: EventTarget) {
  return target instanceof HTMLInputElement && target.checked
}
