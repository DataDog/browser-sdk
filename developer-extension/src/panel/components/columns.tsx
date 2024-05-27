import { Grid, Space, Title } from '@mantine/core'
import React from 'react'

export function Columns({ children }: { children: React.ReactNode }) {
  return (
    <Grid mt="sm" mx="sm">
      {children}
    </Grid>
  )
}

function Column({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Grid.Col span={{ sm: 12, md: 4 }}>
      <Title order={3}>{title}</Title>
      <Space h="sm" />
      {children || '(empty)'}
      <Space h="sm" />
    </Grid.Col>
  )
}

Columns.Column = Column
