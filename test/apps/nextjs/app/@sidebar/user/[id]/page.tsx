// Parallel route sidebar for /user/[id]. Updates to show the current user, letting the
// test confirm parallel routes don't create spurious "@sidebar" RUM views.
export default async function SidebarUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <aside data-testid="sidebar">
      <p>Sidebar: User {id}</p>
    </aside>
  )
}
