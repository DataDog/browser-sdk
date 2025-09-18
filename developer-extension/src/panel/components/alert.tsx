import type { ReactNode } from 'react'
import React from 'react'
import { Alert as MantineAlert, Center, Group, MantineProvider, Space } from '@mantine/core'

export function Alert({
  level,
  title,
  message,
  button,
  mt,
}: {
  level: 'warning' | 'error'
  title?: string
  message: string
  button?: ReactNode
  mt?: string
}) {
  const color = level === 'warning' ? ('orange' as const) : ('red' as const)
  return (
    <Center mt={mt || 'xl'} className="dd-privacy-allow">
      <MantineAlert color={color} title={title}>
        {message}
        {button && (
          <>
            <Space h="sm" />
            <MantineProvider defaultColorScheme="auto" theme={{ components: { Button: { defaultProps: { color } } } }}>
              <Group justify="flex-end">{button}</Group>
            </MantineProvider>
          </>
        )}
      </MantineAlert>
    </Center>
  )
}
