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

  return <Player isReplayForced={infos.cookie.forcedReplay === '1'} />
}

function Player({ isReplayForced }: { isReplayForced: boolean }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [playerStatus, setPlayerStatus] = useState<SessionReplayPlayerStatus>('loading')

  useEffect(() => {
    startSessionReplayPlayer(frameRef.current!, setPlayerStatus)
  }, [])

  return (
    <TabBase>
      <iframe ref={frameRef} className={classes.iframe} data-status={playerStatus} />
      {playerStatus === 'waiting-for-full-snapshot' && <WaitingForFullSnapshot isReplayForced={isReplayForced} />}
    </TabBase>
  )
}

function WaitingForFullSnapshot({ isReplayForced }: { isReplayForced: boolean }) {
  return (
    <Alert
      level="warning"
      message="Waiting for a full snapshot to be generated..."
      button={
        <Button onClick={() => generateFullSnapshot(isReplayForced)} color="orange">
          Generate Full Snapshot
        </Button>
      }
    />
  )
}

function generateFullSnapshot(isReplayForced: boolean) {
  // Restart to make sure we have a fresh Full Snapshot
  const startParam = isReplayForced ? '{ force: true }' : ''
  evalInWindow(`
    DD_RUM.stopSessionReplayRecording()
    DD_RUM.startSessionReplayRecording(${startParam})
  `).catch((error) => {
    logger.error('While restarting recording:', error)
  })
}
