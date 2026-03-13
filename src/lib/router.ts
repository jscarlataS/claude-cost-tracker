// src/lib/router.ts — Lightweight pushState router

export type Route =
  | { view: 'sessions' }
  | { view: 'session'; id: string; agentId?: string }
  | { view: 'tools' }
  | { view: 'charts' }
  | { view: 'cache' }

export interface RouteParams {
  dateFilter?: string  // from ?date=YYYY-MM-DD
}

export function parseRoute(pathname: string, search: string, hash: string): { route: Route; params: RouteParams } {
  const params: RouteParams = {}

  // Parse query params
  const searchParams = new URLSearchParams(search)
  const dateParam = searchParams.get('date')
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    params.dateFilter = dateParam
  }

  // Parse route
  if (pathname === '/tools') {
    return { route: { view: 'tools' }, params }
  }
  if (pathname === '/charts') {
    return { route: { view: 'charts' }, params }
  }
  if (pathname === '/cache') {
    return { route: { view: 'cache' }, params }
  }

  const sessionMatch = pathname.match(/^\/sessions\/(.+)$/)
  if (sessionMatch) {
    const agentMatch = hash.match(/^#agent-(.+)$/)
    return {
      route: {
        view: 'session',
        id: sessionMatch[1],
        agentId: agentMatch?.[1],
      },
      params,
    }
  }

  return { route: { view: 'sessions' }, params }
}

export function routeToPath(route: Route): string {
  switch (route.view) {
    case 'sessions': return '/sessions'
    case 'session': return `/sessions/${route.id}`
    case 'tools': return '/tools'
    case 'charts': return '/charts'
    case 'cache': return '/cache'
  }
}

export function navigate(route: Route) {
  const path = routeToPath(route)
  const hash = route.view === 'session' && route.agentId ? `#agent-${route.agentId}` : ''
  history.pushState({}, '', path + hash)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
