export const PanelTabs = {
  Events: 'events',
  Infos: 'infos',
  Settings: 'settings',
  Replay: 'replay',
} as const
export type PanelTabsEnum = (typeof PanelTabs)[keyof typeof PanelTabs]

export const DEFAULT_PANEL_TAB: PanelTabsEnum = PanelTabs.Events
