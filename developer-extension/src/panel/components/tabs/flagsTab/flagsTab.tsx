import { Box } from '@mantine/core'
import React from 'react'
import { TabBase } from '../../tabBase'
import { useFlagAuth } from './useFlagAuth'
import { ConnectScreen, ConnectionHeader } from './connectScreen'

export function FlagsTab() {
  const auth = useFlagAuth()

  // Gate the whole tab: nothing shows until the user connects via OAuth. Browsing the flag catalog
  // is added on top of this in the follow-up PR.
  if (!auth.isConnected) {
    return (
      <TabBase>
        <ConnectScreen auth={auth} />
      </TabBase>
    )
  }

  return (
    <TabBase
      top={
        <Box px="md" className="dd-privacy-allow">
          <ConnectionHeader auth={auth} />
        </Box>
      }
    >
      <Box px="md" py="sm" className="dd-privacy-allow" />
    </TabBase>
  )
}
