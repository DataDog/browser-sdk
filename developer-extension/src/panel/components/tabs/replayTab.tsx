import { Button, Flex, Checkbox, Badge } from '@mantine/core'
import React, { useEffect, useRef, useState } from 'react'
import { TabBase } from '../tabBase'
import type { SessionReplayPlayerState } from '../../sessionReplayPlayer/startSessionReplayPlayer'
import { startSessionReplayPlayer } from '../../sessionReplayPlayer/startSessionReplayPlayer'
import { evalInWindow } from '../../evalInWindow'
import { createLogger } from '../../../common/logger'
import { Alert } from '../alert'
import { useSdkInfos } from '../../hooks/useSdkInfos'
import { useSettings } from '../../hooks/useSettings'
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
  const [{ useDevReplaySandbox }] = useSettings()
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [playerState, setPlayerState] = useState<SessionReplayPlayerState>({
    status: 'loading',
    recordCount: 0,
    excludeMouseMovements: false,
  })
  const playerRef = useRef<ReturnType<typeof startSessionReplayPlayer>>(null)

  useEffect(() => {
    playerRef.current = startSessionReplayPlayer(frameRef.current!, setPlayerState, useDevReplaySandbox)
  }, [useDevReplaySandbox])

  const downloadRecords = () => {
    if (!playerRef.current?.getRecords) {
      return
    }

    const records = playerRef.current.getRecords()
    // Create a segment that contains enough information to be compatible with the Replay Playground Static App
    const segment = { records, source: 'browser', records_count: records.length, view: { id: 'xxx' } }
    const segmentStr = JSON.stringify(segment, null, 2)
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(segmentStr)}`

    const downloadLink = document.createElement('a')
    downloadLink.setAttribute('href', dataUri)
    downloadLink.setAttribute('download', `session-replay-records-${Date.now()}.json`)
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
  }

  return (
    <TabBase
      top={
        <Flex>
          <Flex justify="space-between" align="center" flex="1">
            <Flex align="center" gap="md">
              <Button onClick={generateFullSnapshot} color="orange">
                Force Full Snapshot
              </Button>
              <Checkbox
                label="Exclude mouse movements"
                checked={playerState.excludeMouseMovements}
                onChange={(event) => playerRef.current?.setExcludeMouseMovements(event.currentTarget.checked)}
              />
            </Flex>
            <Flex align="center" gap="xs">
              <div>Records applied: {playerState.recordCount}</div>
              <Button
                onClick={downloadRecords}
                variant="subtle"
                disabled={playerState.recordCount === 0}
                title="Download records as JSON"
                p="xs"
              >
                📥
              </Button>
            </Flex>
          </Flex>
          <Flex align="center">{useDevReplaySandbox ? <Badge color="blue">Dev</Badge> : <></>}</Flex>
        </Flex>
      }
    >
      <iframe ref={frameRef} className={classes.iframe} data-status={playerState.status} />
      {playerState.status === 'waiting-for-full-snapshot' && <WaitingForFullSnapshot />}
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
