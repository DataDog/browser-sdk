export default async function WeatherWidget() {
  // Simulate an independent slow fetch
  const res = await fetch('https://httpbin.org/delay/15', { cache: 'no-store' })
  const data = await res.json()

  return (
    <div style={{ padding: '1rem', background: '#fff3e0', borderRadius: '8px' }}>
      <h3>Weather Widget (independent fetch)</h3>
      <p>
        Simulated 15s external API call. Origin: <code>{data.origin}</code>
      </p>
    </div>
  )
}
