import { Global } from '@mantine/core'
import { useColorScheme } from '@mantine/hooks'
import React from 'react'
import ReactJson from 'react-json-view'

interface JsonProps {
  src: object
  name?: string
  collapsed?: boolean | number
}

export function Json({ src, name, collapsed }: JsonProps) {
  const colorScheme = useColorScheme()
  return (
    <>
      <Global
        styles={[
          {
            '.object-key-val': {
              paddingTop: '1px !important',
              paddingBottom: '1px !important',
            },
            '.variable-row': {
              paddingTop: '1px !important',
              paddingBottom: '1px !important',
            },
            '.object-key': {
              letterSpacing: '0 !important',
            },
            '.array-key': {
              letterSpacing: '0 !important',
            },
          },
        ]}
      />
      <ReactJson
        src={src}
        collapsed={collapsed}
        theme={colorScheme === 'dark' ? 'monokai' : 'bright:inverted'}
        name={name}
        displayDataTypes={false}
        style={{
          backgroundColor: 'transparent',
          fontFamily: 'menlo, sans-serif', // same as devtools
          fontSize: '11px', // same as devtools
          // By default, mantine sets font-smoothing: antialiazed, which makes some font hard to
          // read
          WebkitFontSmoothing: 'auto',
        }}
        quotesOnKeys={false}
        {...{
          // This is missing from react json typings
          displayArrayKey: false,
        }}
      />
    </>
  )
}
