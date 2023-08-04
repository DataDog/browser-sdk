import { Box, Text, useMantineTheme } from '@mantine/core'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import React from 'react'

const HORIZONTAL_PADDING = 12
const VERTICAL_PADDING = 6

export function Grid({ children, columnsCount }: { children: ReactNode; columnsCount: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `${Array.from({ length: columnsCount - 1 }, () => 'auto').join(' ')} 1fr`,
      }}
    >
      {children}
    </Box>
  )
}

Grid.HeaderCell = function ({ children }: { children: ReactNode }) {
  return (
    <Grid.Cell>
      <Text weight="bold">{children}</Text>
    </Grid.Cell>
  )
}

Grid.Cell = function ({ children, center }: { children: ReactNode; center?: boolean }) {
  const theme = useMantineTheme()
  const borderColor = theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
  return (
    <Box
      sx={{
        borderBottom: `1px solid ${borderColor}`,
        paddingLeft: HORIZONTAL_PADDING,
        paddingTop: VERTICAL_PADDING,
        paddingBottom: VERTICAL_PADDING,
        ':last-child': {
          paddingRight: HORIZONTAL_PADDING,
        },
        textAlign: center ? 'center' : undefined,
      }}
    >
      {children}
    </Box>
  )
}

Grid.Row = function ({ children, ...props }: { children: ReactNode } & ComponentPropsWithoutRef<'div'>) {
  return (
    <Box
      sx={{
        display: 'contents',
        cursor: props.onClick ? 'pointer' : 'default',
      }}
      {...props}
    >
      {children}
    </Box>
  )
}
