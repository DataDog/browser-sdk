import { Button } from '@mantine/core'
import React, { useEffect, useRef, useState } from 'react'
import { TabBase } from '../tabBase'
import type { SessionReplayPlayerStatus } from '../../sessionReplayPlayer/startSessionReplayPlayer'
import { startSessionReplayPlayer } from '../../sessionReplayPlayer/startSessionReplayPlayer'
import { evalInWindow } from '../../evalInWindow'
import { createLogger } from '../../../common/logger'
import { Alert } from '../alert'
import { useSdkInfos } from '../../hooks/useSdkInfos'
import * as classes from './replayTab.module.css'

const logger = createLogger('replayTab')

export function ReplayTab() {
  const infos = useSdkInfos()
  if (!infos) {
    return <Alert level="error" message="No RUM SDK present in the page." />
  }

  if (!infos.cookie?.rum) {
    return <Alert level="error" message="No RUM session." />
  }

  if (infos.cookie.rum === '0') {
    return <Alert level="error" message="RUM session sampled out." />
  }

  if (infos.cookie.rum === '2' && infos.cookie.forcedReplay !== '1') {
    return <Alert level="error" message="RUM session plan does not include replay." />
  }

  return <Player />
}

function Player() {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [playerStatus, setPlayerStatus] = useState<SessionReplayPlayerStatus>('loading')

  useEffect(() => {
    startSessionReplayPlayer(frameRef.current!, setPlayerStatus)
  }, [])

  return (
    <TabBase
      top={<Button onClick={generateFullSnapshot} color="orange">Force Full Snapshot</Button>}
    >
      <iframe ref={frameRef} className={classes.iframe} data-status={playerStatus} />
      {playerStatus === 'waiting-for-full-snapshot' && <WaitingForFullSnapshot />}
    </TabBase>
  )
}

function WaitingForFullSnapshot() {
  return (
    <Alert
      level="warning"
      message="⚠️ Waiting for a full snapshot to be generated. Navigate to another view, or press the button above to force a full snapshot."
    />
  )
}

function generateFullSnapshot() {
  // Restart to make sure we have a fresh Full Snapshot
  evalInWindow(`
    DD_RUM.stopSessionReplayRecording()
    DD_RUM.startSessionReplayRecording({ force: true })
  `).catch((error) => {
    logger.error('While restarting recording:', error)
  })
}
