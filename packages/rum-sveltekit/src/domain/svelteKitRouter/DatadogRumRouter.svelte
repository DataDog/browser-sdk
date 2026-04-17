<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { trackSvelteKitNavigation } from './svelteKitRouter'

  // afterNavigate must be called during component initialization. It fires on initial mount
  // (navigation.type === 'enter') and after every subsequent client-side navigation.
  afterNavigate(trackSvelteKitNavigation)
</script>
