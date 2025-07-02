import { getDefaultViewName } from './getDefaultViewName'

export const getCustomOrDefaultViewName = (customViewName: string | undefined, viewPathUrl: string): string =>
  customViewName || getDefaultViewName(viewPathUrl)
