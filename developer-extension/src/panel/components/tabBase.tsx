import { Container, Flex, Space } from '@mantine/core'
import type { ReactNode } from 'react'
import React from 'react'

interface TabBaseProps {
  /**
   * Content displayed at the top of the tab, does not scroll.
   */
  top?: ReactNode

  /**
   * Content of the tab, scrolls
   */
  children: ReactNode
}

export function TabBase({ top, children }: TabBaseProps) {
  return (
    <Flex direction="column" sx={{ height: '100%' }}>
      {top && (
        <>
          <Container fluid sx={{ margin: 0 }}>
            <Space h="sm" />
            {top}
            <Space h="sm" />
          </Container>
        </>
      )}
      <Container fluid sx={{ flex: 1, overflowY: 'auto', margin: 0 }}>
        {!top && <Space h="sm" />}
        {children}
      </Container>
    </Flex>
  )
}
