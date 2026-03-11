// Required fallback for the @sidebar parallel route on routes that have no sidebar slot
// (e.g. error-test). Without it, Next.js would 404 on those routes.
export default function SidebarDefault() {
  return null
}
