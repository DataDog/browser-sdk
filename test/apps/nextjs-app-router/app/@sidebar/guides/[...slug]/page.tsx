export default async function SidebarGuides({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params

  return (
    <aside
      data-testid="sidebar"
      style={{ borderLeft: '2px solid #ddd', paddingLeft: '1rem', marginLeft: '1rem', minWidth: '150px' }}
    >
      <p>Sidebar: Guides {slug.join('/')}</p>
    </aside>
  )
}
