import { RenderMode, ServerRoute } from '@angular/ssr'

// Render every page on each request (the default prerenders them at build time)
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }]
