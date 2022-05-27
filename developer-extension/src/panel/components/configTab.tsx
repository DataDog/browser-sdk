import { Text } from '@mantine/core'
import React from 'react'
import { useSdkConfig } from '../useSdkConfig'
import { Json } from './json'

export function ConfigTab() {
  const { rumConfig, logsConfig } = useSdkConfig()

  return (
    <>
      <Entry name="RUM configuration" value={rumConfig} />
      <Entry name="Logs configuration" value={logsConfig} />
    </>
  )
}

function Entry({ name, value }: { name: string; value: any }) {
  return (
    <Text size="sm" component="div">
      {value ? <Json name={name} src={value} collapsed={1} /> : <>{name}: (empty)</>}
    </Text>
  )
}
