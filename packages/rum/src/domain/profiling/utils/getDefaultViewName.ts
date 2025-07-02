// This is the regex used to extract the path from the url (from SimpleUrlGroupingProcessor.java)
const PATH_MIXED_ALPHANUMERICS = new RegExp('(?<=/)(?![vV]\\d{1,2}/)(?:[^\\/\\d\\?]*[\\d]+[^\\/\\?]*)', 'g')

export function getDefaultViewName(viewPathUrl: string): string {
  if (!viewPathUrl) {
    return '/'
  }

  // Replace all the mixed alphanumerics with a ?
  return viewPathUrl.replace(PATH_MIXED_ALPHANUMERICS, '?')
}
