import type { BoxProps } from '@mantine/core'
import { Box, Text } from '@mantine/core'
import type { ComponentPropsWithoutRef, ForwardedRef, ReactNode } from 'react'
import React, { forwardRef } from 'react'
import { BORDER_RADIUS, separatorBorder } from '../../../uiUtils'

export const HORIZONTAL_PADDING = 16
export const VERTICAL_PADDING = 6

export function Grid({ children, columnsCount }: { children: ReactNode; columnsCount: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `${Array.from({ length: columnsCount - 1 }, () => 'auto').join(' ')} minmax(200px, 1fr)`,
      }}
      mx="md"
    >
      {children}
    </Box>
  )
}

Grid.HeaderCell = forwardRef(function (
  { children, ...props }: { children: ReactNode } & BoxProps & ComponentPropsWithoutRef<'div'>,
  ref: ForwardedRef<HTMLDivElement>
) {
  return (
    <Grid.Cell
      ref={ref}
      {...props}
      sx={(theme) => ({
        borderTop: separatorBorder(theme),
        ':first-of-type': { borderTopLeftRadius: BORDER_RADIUS },
        ':last-of-type': { borderTopRightRadius: BORDER_RADIUS },
        cursor: props.onClick ? 'pointer' : 'default',
      })}
    >
      <Text weight="bold">{children}</Text>
    </Grid.Cell>
  )
})

Grid.Cell = forwardRef(function (
  {
    children,
    center,
    ...props
  }: { children: ReactNode; center?: boolean } & BoxProps & ComponentPropsWithoutRef<'div'>,
  ref: ForwardedRef<HTMLDivElement>
) {
  return (
    <Box
      ref={ref}
      {...props}
      sx={[
        (theme) => ({
          position: 'relative',
          borderBottom: separatorBorder(theme),
          paddingLeft: HORIZONTAL_PADDING / 2,
          paddingRight: HORIZONTAL_PADDING / 2,
          paddingTop: VERTICAL_PADDING,
          paddingBottom: VERTICAL_PADDING,
          ':first-of-type': {
            borderLeft: separatorBorder(theme),
            paddingLeft: HORIZONTAL_PADDING,
          },
          ':last-of-type': {
            borderRight: separatorBorder(theme),
            paddingRight: HORIZONTAL_PADDING,
          },
          textAlign: center ? 'center' : undefined,
          cursor: props.onClick ? 'pointer' : 'default',
        }),
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    >
      {children}
    </Box>
  )
})

Grid.Row = forwardRef(function (
  { children, ...props }: { children: ReactNode } & ComponentPropsWithoutRef<'div'>,
  ref: ForwardedRef<HTMLDivElement>
) {
  return (
    <Box
      ref={ref}
      sx={{
        display: 'contents',
        cursor: props.onClick ? 'pointer' : 'default',
      }}
      {...props}
    >
      {children}
    </Box>
  )
})
