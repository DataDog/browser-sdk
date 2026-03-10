export default function ThrowErrorPage() {
  return <div>This page should not render</div>
}

export function getServerSideProps() {
  throw new Error('SSR error from pages router')
}
