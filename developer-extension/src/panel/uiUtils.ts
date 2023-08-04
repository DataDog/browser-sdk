import type { MantineTheme } from '@mantine/core'

export const BORDER_RADIUS = 8 // arbitrary
export const CHECKBOX_WIDTH = 20 // the Mantine checkbox component happen to be 20px wide
export const TABS_LIST_BORDER_WIDTH = 2 // the Mantine tabs list happen to have a 2px border

export function separatorBorder(theme: MantineTheme) {
  return `1px solid ${borderColor(theme)}`
}

/**
 * Returns the same CSS border as the mantine TabsList
 */
export function tabsListBorder(theme: MantineTheme) {
  // https://github.com/mantinedev/mantine/blob/cf0f85faec56615ea5fbd7813e83bac60dbaefb7/src/mantine-core/src/Tabs/TabsList/TabsList.styles.ts#L25-L26
  return `${TABS_LIST_BORDER_WIDTH}px solid ${borderColor(theme)}`
}

function borderColor(theme: MantineTheme) {
  return theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]
}
