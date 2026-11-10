import { Button, Flex, Checkbox, Badge, Tooltip } from '@mantine/core'
import React, { useEffect, useRef, useState } from 'react'
import { TabBase } from '../tabBase'
import type { SessionReplayPlayer, SessionReplayPlayerState } from '../../sessionReplayPlayer/startSessionReplayPlayer'
import { startSessionReplayPlayer } from '../../sessionReplayPlayer/startSessionReplayPlayer'
import { getReplaySandboxSettings } from '../../sessionReplayPlayer/getReplaySandboxSettings'
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

  const { rumTrackingType } = infos

  if (!rumTrackingType) {
    return <Alert level="error" message="No RUM session." />
  }

  if (rumTrackingType === '0') {
    return <Alert level="error" message="RUM session sampled out." />
  }

  if (rumTrackingType === '2' && infos.cookie?.forcedReplay !== '1') {
    return <Alert level="error" message="RUM session plan does not include replay." />
  }

  return <Player />
}

function Player() {
  const [settings] = useSettings()
  const { replaySandboxSource, replaySandboxHash, replaySandboxFeatureFlags } = getReplaySandboxSettings(settings)

  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const [playerState, setPlayerState] = useState<SessionReplayPlayerState>({
    status: 'loading',
    recordCount: 0,
    excludeMouseMovements: false,
  })
  const playerRef = useRef<SessionReplayPlayer>(undefined)
  const excludeMouseMovementsRef = useRef(false)

  useEffect(() => {
    const iframe = frameRef.current
    if (!iframe) {
      return
    }
    const abortController = new AbortController()
    playerRef.current = startSessionReplayPlayer({
      iframe,
      setPlayerState,
      source:
        replaySandboxSource === 'static-hash'
          ? { type: 'static-hash', hash: replaySandboxHash }
          : { type: replaySandboxSource },
      sandboxFeatureFlags: replaySandboxFeatureFlags,
      excludeMouseMovements: excludeMouseMovementsRef.current,
      signal: abortController.signal,
    })
    return () => {
      abortController.abort()
      playerRef.current = undefined
    }
  }, [replaySandboxFeatureFlags, replaySandboxHash, replaySandboxSource])

  const downloadRecords = () => {
    if (!playerRef.current?.getRecords) {
      return
    }

    const records = playerRef.current.getRecords()

    // Create a segment with the metadata the sandbox requires.
    const segment = {
      records,
      source: 'browser',
      records_count: records.length,
      view: { id: 'xxx' },
    }
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
                onChange={(event) => {
                  excludeMouseMovementsRef.current = event.currentTarget.checked
                  playerRef.current?.setExcludeMouseMovements(excludeMouseMovementsRef.current)
                }}
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
          <Flex align="center" gap="xs">
            {replaySandboxSource === 'local' && <Badge color="blue">Local</Badge>}
            {replaySandboxSource === 'static-hash' && <Badge color="blue">Static hash</Badge>}
            {replaySandboxFeatureFlags.length > 0 && (
              <Tooltip
                label={replaySandboxFeatureFlags.map((flagName) => (
                  <div key={flagName}>{flagName}</div>
                ))}
                withArrow
              >
                <Badge color="blue">Flags</Badge>
              </Tooltip>
            )}
          </Flex>
        </Flex>
      }
    >
      <iframe ref={frameRef} className={classes.iframe} data-status={playerState.status} />
      {playerState.status === 'waiting-for-full-snapshot' && <WaitingForFullSnapshot />}
      {playerState.status === 'no-sandbox-build' && <Alert level="error" message="No sandbox build for this hash." />}
      {playerState.status === 'error' && <Alert level="error" message="Unable to load the replay sandbox." />}
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
