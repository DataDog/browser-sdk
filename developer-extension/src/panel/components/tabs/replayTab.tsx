import { Box } from '@mantine/core'
import React, { useEffect, useRef } from 'react'
import { TabBase } from '../tabBase'
import { startSessionReplayPlayer } from '../../sessionReplayPlayer/startSessionReplayPlayer'

export function ReplayTab() {
  const frameRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    startSessionReplayPlayer(frameRef.current!)
  }, [])

  return (
    <TabBase>
      <Box
        component="iframe"
        ref={frameRef}
        sx={{
          height: '100%',
          width: '100%',
          display: 'block',
          border: 'none',
        }}
      ></Box>
    </TabBase>
  )
}
