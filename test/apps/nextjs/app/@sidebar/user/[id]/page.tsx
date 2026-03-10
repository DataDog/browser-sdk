export default async function SidebarUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return (
    <aside
      data-testid="sidebar"
      style={{ borderLeft: '2px solid #ddd', paddingLeft: '1rem', marginLeft: '1rem', minWidth: '150px' }}
    >
      <p>Sidebar: User {id}</p>
    </aside>
  )
}
