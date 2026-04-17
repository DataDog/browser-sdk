<script lang="ts">
  import { onMount } from 'svelte'
  import { onNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import { startSveltekitRouterView } from './startSveltekitView'

  // Handle the initial page load — onNavigate does not fire for the first render.
  onMount(() => {
    startSveltekitRouterView(page.route.id)
  })

  // Handle subsequent client-side navigations.
  // Skip 'leave' navigations where navigation.to is null (document unloads to external URLs).
  onNavigate((navigation) => {
    if (navigation.to !== null) {
      startSveltekitRouterView(navigation.to.route.id)
    }
  })
</script>
