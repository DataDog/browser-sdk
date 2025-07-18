// This is the regex used to extract the path from the url (from SimpleUrlGroupingProcessor.java)
// It's a bit different from the one in the java code because we removed the lookbehind unsupported by Safari.
const PATH_MIXED_ALPHANUMERICS = /\/(?![vV]\d{1,2}\/)([^/\d?]*\d+[^/?]*)/g

export function getDefaultViewName(viewPathUrl: string): string {
  if (!viewPathUrl) {
    return '/'
  }

  // Replace all the mixed alphanumerics with a ?
  return viewPathUrl.replace(PATH_MIXED_ALPHANUMERICS, '/?')
}
