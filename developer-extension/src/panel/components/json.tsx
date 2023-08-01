import type { BoxProps, MantineColor, Sx } from '@mantine/core'
import { useMantineTheme, Box, Collapse, Menu, Text } from '@mantine/core'
import type { ForwardedRef, ReactNode } from 'react'
import React, { forwardRef, useContext, createContext, useState } from 'react'
import { formatNumber } from '../formatNumber'

interface JsonProps {
  value: unknown
  defaultCollapseLevel?: number
  getMenuItemsForPath?: GetMenuItemsForPath
}

type GetMenuItemsForPath = (path: string, value: unknown) => ReactNode

const LINE_HEIGHT = '20px'
const INDENT = 18
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

export const JsonContext = createContext<{
  defaultCollapseLevel: number
  getMenuItemsForPath?: GetMenuItemsForPath
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
    { value, defaultCollapseLevel = Infinity, getMenuItemsForPath, ...boxProps }: JsonProps & BoxProps,
    ref: ForwardedRef<HTMLDivElement | HTMLSpanElement>
  ) => {
    const theme = useMantineTheme()
    return (
      <Box
        ref={
          // setting a HTMLDivElement | HTMLSpanElement ref messes with TS types as the component prop is also div | span
          ref as any
        }
        {...boxProps}
        component={doesValueHasChildren(value) ? 'div' : 'span'}
        className="JSON"
        sx={{
          ...boxProps.sx,
          lineHeight: LINE_HEIGHT,
          wordBreak: 'break-word',
          fontFamily: theme.fontFamilyMonospace,
          fontSize: theme.other.fontSizeMonospace,
          WebkitFontSmoothing: 'auto',
        }}
      >
        <JsonContext.Provider value={{ defaultCollapseLevel, getMenuItemsForPath }}>
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
  }
)

function JsonValue({ descriptor }: { descriptor: JsonValueDescriptor }) {
  const theme = useMantineTheme()

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

  const themeColors = COLORS[theme.colorScheme]
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
        {typeof descriptor.value === 'number' ? formatNumber(descriptor.value) : JSON.stringify(descriptor.value)}
      </JsonText>
    </JsonLine>
  )
}

function JsonValueChildren({ children, descriptor }: { children: ReactNode; descriptor: JsonValueDescriptor }) {
  const { defaultCollapseLevel } = useContext(JsonContext)!

  // The root is not collapsible
  const isCollapsible = descriptor.parentType !== 'root'

  const [isCollapsed, setIsCollapsed] = useState(isCollapsible && descriptor.depth >= defaultCollapseLevel)
  const theme = useMantineTheme()

  function toggleIsCollapsed() {
    setIsCollapsed((previous) => !previous)
  }

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: LINE_HEIGHT,
      }}
    >
      <Box
        bg={`gray.${theme.colorScheme === 'dark' ? 8 - descriptor.depth : descriptor.depth + 1}`}
        sx={{
          position: 'absolute',
          top: 1,
          left: 0,
          width: INDENT,
          bottom: 1,
          lineHeight: `${INDENT}px`,
          textAlign: 'center',
          borderRadius: 4,
          userSelect: 'none',
          cursor: isCollapsible ? 'pointer' : undefined,
        }}
        onClick={isCollapsible ? toggleIsCollapsed : undefined}
      >
        {isCollapsible && (isCollapsed ? '▸' : '▾')}
      </Box>
      <JsonLine
        sx={{
          ...(descriptor.parentType === 'array' && {
            position: 'absolute',
          }),
        }}
        descriptor={descriptor}
      >
        {isCollapsed && (
          <Box
            component="span"
            sx={{
              cursor: 'pointer',
            }}
            onClick={toggleIsCollapsed}
          >
            ...
          </Box>
        )}
      </JsonLine>
      <Collapse in={!isCollapsed}>{children}</Collapse>
    </Box>
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
        <Text component="span" color={color} sx={{ fontFamily: 'inherit', cursor: 'pointer' }}>
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
  sx,
  onClick,
  descriptor,
}: {
  children: ReactNode
  sx?: Sx
  onClick?: () => void
  descriptor: JsonValueDescriptor
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
      sx={{
        ...(!isTopLevel && {
          marginLeft: INDENT * descriptor.depth + 4,

          // This indents wrapping lines.
          // https://stackoverflow.com/questions/480567/what-is-the-best-way-to-indent-text-in-a-div-when-it-wraps
          paddingLeft: INDENT,
          textIndent: -INDENT,
        }),

        ...sx,
      }}
      onClick={onClick}
    >
      {prefix}
      {children}
    </Box>
  )
}

function CopyMenuItem({ value, children }: { value: unknown; children: ReactNode }) {
  return (
    <Menu.Item
      onClick={() => {
        copy(JSON.stringify(value, null, 2))
      }}
    >
      {children}
    </Menu.Item>
  )
}

function copy(text: string) {
  // Unfortunately, navigator.clipboard.writeText does not seem to work in extensions
  const container = document.createElement('textarea')
  container.innerHTML = text
  document.body.appendChild(container)
  container.select()
  document.execCommand('copy')
  document.body.removeChild(container)
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
