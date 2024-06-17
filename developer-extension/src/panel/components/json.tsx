import type { BoxProps, MantineColor } from '@mantine/core'
import { Box, Collapse, Menu, Text } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import { IconCopy } from '@tabler/icons-react'
import type { ForwardedRef, ReactNode } from 'react'
import React, { forwardRef, useContext, createContext, useState } from 'react'
import { copy } from '../copy'
import { formatNumber } from '../formatNumber'

import * as classes from './json.module.css'

interface JsonProps {
  value: unknown
  defaultCollapseLevel?: number
  getMenuItemsForPath?: GetMenuItemsForPath
  formatValue?: FormatValue
}

type GetMenuItemsForPath = (path: string, value: unknown) => ReactNode
type FormatValue = (path: string, value: unknown) => ReactNode

const COLORS = {
  dark: {
    null: 'gray',
    // eslint-disable-next-line id-denylist
    number: 'orange',
    // eslint-disable-next-line id-denylist
    string: 'yellow',
    // eslint-disable-next-line id-denylist
    boolean: 'violet.4',
  },
  light: {
    null: 'gray',
    // eslint-disable-next-line id-denylist
    number: 'orange.7',
    // eslint-disable-next-line id-denylist
    string: 'yellow.9',
    // eslint-disable-next-line id-denylist
    boolean: 'violet.7',
  },
}

const JsonContext = createContext<{
  defaultCollapseLevel: number
  getMenuItemsForPath?: GetMenuItemsForPath
  formatValue: FormatValue
} | null>(null)

type JsonValueDescriptor =
  | {
      parentType: 'root'
      value: unknown
      depth: 0
      path: ''
    }
  | {
      parentType: 'array'
      parentValue: unknown[]
      value: unknown
      path: string
      depth: number
    }
  | {
      parentType: 'object'
      parentValue: object
      value: unknown
      path: string
      depth: number
      key: string
    }

export const Json = forwardRef(
  (
    {
      value,
      defaultCollapseLevel = Infinity,
      formatValue = defaultFormatValue,
      getMenuItemsForPath,
      ...boxProps
    }: JsonProps & BoxProps,
    ref: ForwardedRef<HTMLDivElement | HTMLSpanElement>
  ) => (
    <Box
      ref={
        // setting a HTMLDivElement | HTMLSpanElement ref messes with TS types as the component prop is also div | span
        ref as any
      }
      {...boxProps}
      component={doesValueHasChildren(value) ? 'div' : 'span'}
      className={classes.root}
    >
      <JsonContext.Provider value={{ defaultCollapseLevel, getMenuItemsForPath, formatValue }}>
        <JsonValue
          descriptor={{
            parentType: 'root',
            value,
            depth: 0,
            path: '',
          }}
        />
      </JsonContext.Provider>
    </Box>
  )
)

export function defaultFormatValue(_path: string, value: unknown) {
  return typeof value === 'number' ? formatNumber(value) : JSON.stringify(value)
}

function JsonValue({ descriptor }: { descriptor: JsonValueDescriptor }) {
  const colorScheme = useColorScheme()
  const { formatValue } = useContext(JsonContext)!

  if (Array.isArray(descriptor.value)) {
    if (descriptor.value.length === 0) {
      return <JsonEmptyValue label="[empty array]" descriptor={descriptor} />
    }

    return (
      <JsonValueChildren descriptor={descriptor}>
        {descriptor.value.map((child, i) => (
          <JsonValue
            key={i}
            descriptor={{
              parentType: 'array',
              parentValue: descriptor.value as unknown[],
              value: child,
              path: descriptor.path,
              depth: descriptor.depth + 1,
            }}
          />
        ))}
      </JsonValueChildren>
    )
  }

  if (typeof descriptor.value === 'object' && descriptor.value !== null) {
    const entries = Object.entries(descriptor.value)
    if (entries.length === 0) {
      return <JsonEmptyValue label="{empty object}" descriptor={descriptor} />
    }

    return (
      <JsonValueChildren descriptor={descriptor}>
        {Object.entries(descriptor.value).map(([key, child]) => (
          <JsonValue
            key={key}
            descriptor={{
              parentType: 'object',
              parentValue: descriptor.value as object,
              value: child,
              path: descriptor.path ? `${descriptor.path}.${key}` : key,
              depth: descriptor.depth + 1,
              key,
            }}
          />
        ))}
      </JsonValueChildren>
    )
  }
  const themeColors = COLORS[colorScheme]
  const color =
    descriptor.value === null
      ? themeColors.null
      : typeof descriptor.value === 'number'
        ? themeColors.number
        : typeof descriptor.value === 'string'
          ? themeColors.string
          : typeof descriptor.value === 'boolean'
            ? themeColors.boolean
            : undefined

  return (
    <JsonLine descriptor={descriptor}>
      <JsonText color={color} descriptor={descriptor}>
        {formatValue(descriptor.path, descriptor.value)}
      </JsonText>
    </JsonLine>
  )
}

function JsonValueChildren({ children, descriptor }: { children: ReactNode; descriptor: JsonValueDescriptor }) {
  const { defaultCollapseLevel } = useContext(JsonContext)!

  // The root is not collapsible
  const isCollapsible = descriptor.parentType !== 'root'

  const [isCollapsed, setIsCollapsed] = useState(isCollapsible && descriptor.depth >= defaultCollapseLevel)
  const colorScheme = useColorScheme()

  function toggleIsCollapsed() {
    setIsCollapsed((previous) => !previous)
  }

  return (
    <div className={classes.valueChildren}>
      <Box
        bg={`gray.${colorScheme === 'dark' ? 8 - descriptor.depth : descriptor.depth + 1}`}
        className={classes.valueChildrenIndent}
        data-collapsible={isCollapsible}
        onClick={isCollapsible ? toggleIsCollapsed : undefined}
      >
        {isCollapsible && (isCollapsed ? '▸' : '▾')}
      </Box>
      <JsonLine descriptor={descriptor} isFloating={descriptor.parentType === 'array'}>
        {isCollapsed && (
          <span className={classes.valueChildrenCollapsedEllipsis} onClick={toggleIsCollapsed}>
            ...
          </span>
        )}
      </JsonLine>
      <Collapse in={!isCollapsed}>{children}</Collapse>
    </div>
  )
}

function JsonEmptyValue({ label, descriptor }: { label: string; descriptor: JsonValueDescriptor }) {
  return (
    <JsonLine descriptor={descriptor}>
      <JsonText color="dimmed" descriptor={descriptor}>
        {label}
      </JsonText>
    </JsonLine>
  )
}

function JsonText({
  children,
  color,
  descriptor,
}: {
  children: ReactNode
  color?: MantineColor | undefined
  descriptor: JsonValueDescriptor
}) {
  const { getMenuItemsForPath } = useContext(JsonContext)!
  const menuItemsForPath = getMenuItemsForPath?.(descriptor.path, descriptor.value)

  let menuItems: ReactNode

  if (descriptor.parentType === 'object') {
    menuItems = (
      <>
        <CopyMenuItem value={descriptor.value}>Copy property value</CopyMenuItem>
        <CopyMenuItem value={descriptor.parentValue}>Copy parent object</CopyMenuItem>
      </>
    )
  } else if (descriptor.parentType === 'array') {
    menuItems = (
      <>
        <CopyMenuItem value={descriptor.value}>Copy array item</CopyMenuItem>
        <CopyMenuItem value={descriptor.parentValue}>Copy parent array</CopyMenuItem>
      </>
    )
  } else {
    menuItems = (
      <>
        <CopyMenuItem value={descriptor.value}>Copy value</CopyMenuItem>
      </>
    )
  }

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Text component="span" c={color} className={classes.jsonTextTarget}>
          {children}
        </Text>
      </Menu.Target>
      <Menu.Dropdown>
        {menuItems}
        {menuItemsForPath}
      </Menu.Dropdown>
    </Menu>
  )
}

function JsonLine({
  children,
  onClick,
  descriptor,
  isFloating,
}: {
  children: ReactNode
  onClick?: () => void
  descriptor: JsonValueDescriptor
  isFloating?: boolean
}) {
  let prefix
  if (descriptor.parentType === 'array') {
    prefix = <JsonText descriptor={descriptor}>{'- '}</JsonText>
  } else if (descriptor.parentType === 'object') {
    prefix = <JsonText descriptor={descriptor}>{`${descriptor.key}: `}</JsonText>
  }

  const isTopLevel = descriptor.parentType === 'root'

  return (
    <Box
      component={isTopLevel ? 'span' : 'div'}
      className={classes.jsonLine}
      data-top-level={isTopLevel || undefined}
      data-floating={isFloating || undefined}
      style={{ '--depth': descriptor.depth }}
      onClick={onClick}
    >
      {prefix}
      {children}
    </Box>
  )
}

export function CopyMenuItem({ value, children }: { value: unknown; children: ReactNode }) {
  return (
    <Menu.Item
      onClick={() => {
        // Remove the outer quotation marks from copied string
        if (typeof value === 'object') {
          copy(JSON.stringify(value, null, 2))
        } else {
          copy(String(value))
        }
      }}
      leftSection={<IconCopy size={14} />}
    >
      {children}
    </Menu.Item>
  )
}

function doesValueHasChildren(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length > 0
  }

  return false
}
