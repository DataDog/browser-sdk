// Parallel route sidebar for the home route. The test asserts its [data-testid="sidebar"]
// content updates on navigation without polluting RUM view names with "@sidebar".
export default function SidebarHome() {
  return (
    <aside data-testid="sidebar">
      <p>Sidebar: Home</p>
    </aside>
  )
}
