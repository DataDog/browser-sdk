import { Container, Flex, ScrollArea, Space } from '@mantine/core'
import type { ReactNode } from 'react'
import React from 'react'
import * as classes from './tabBase.module.css'

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
    <Flex direction="column" className={classes.root}>
      {top && (
        <Container fluid className={classes.topContainer}>
          <Space h="sm" />
          {top}
          <Space h="sm" />
        </Container>
      )}
      <Flex direction="row" className={classes.horizontalContainer}>
        {leftSide && (
          <ScrollArea className={classes.leftContainer}>
            {leftSide}
            <Space h="sm" />
          </ScrollArea>
        )}
        <Container fluid className={classes.contentContainer}>
          {children}
        </Container>
      </Flex>
    </Flex>
  )
}
