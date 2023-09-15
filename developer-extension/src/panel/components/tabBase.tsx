import { Container, Flex, ScrollArea, Space } from '@mantine/core'
import type { ReactNode } from 'react'
import React from 'react'

interface TabBaseProps {
  /**
   * Content displayed at the top of the tab, does not scroll.
   */
  top?: ReactNode

  /**
   * Content displayed at the left side of the tab.
   */
  leftSide?: ReactNode

  /**
   * Content of the tab, scrolls
   */
  children: ReactNode
}

export function TabBase({ top, leftSide, children }: TabBaseProps) {
  return (
    <Flex direction="column" sx={{ height: '100%' }}>
      {top && (
        <Container fluid sx={{ margin: 0 }}>
          <Space h="sm" />
          {top}
          <Space h="sm" />
        </Container>
      )}
      <Flex
        direction="row"
        sx={{
          flex: 1,
          // This makes sure the row height fills its parent container and is not influenced by its inner content
          minHeight: 0,
        }}
      >
        {leftSide && (
          <>
            <ScrollArea sx={{ width: '250px' }}>
              {leftSide}
              <Space h="sm" />
            </ScrollArea>
          </>
        )}
        <Container fluid sx={{ flex: 1, overflowY: 'auto', padding: 0, margin: 0 }}>
          {children}
        </Container>
      </Flex>
    </Flex>
  )
}
