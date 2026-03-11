// Parallel route sidebar for /guides/[...slug]. Mirrors the user sidebar — exists so the
// layout slot is filled on the guides route without affecting RUM view tracking.
export default async function SidebarGuides({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params

  return (
    <aside data-testid="sidebar">
      <p>Sidebar: Guides {slug.join('/')}</p>
    </aside>
  )
}
