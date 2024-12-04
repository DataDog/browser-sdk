import React from 'react'
import { Text } from '@mantine/core'
import { useEnvInfo } from '../../../hooks/useEnvInfo'

export function EnvironmentInfoTable() {
  const env = useEnvInfo()
  return (
    <>
      <Text size={'xl'}>Libraries</Text>
      {env?.map((e) => (
        <Text>
          {e.name} : {e.version}
        </Text>
      ))}
    </>
  )
}
