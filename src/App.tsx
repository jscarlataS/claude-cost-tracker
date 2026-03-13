import { useState, useEffect, useCallback } from 'react'
import { useSessions } from './hooks/useSessions'
import { SessionList } from './views/SessionList'
import { SessionDetail } from './views/SessionDetail'
import { Charts } from './views/Charts'
import { Tools } from './views/Tools'
import { Cache } from './views/Cache'
import type { Session } from './lib/types'
import type { Filters } from './lib/filters'
import { USD_TO_EUR } from './lib/pricing'
import { parseRoute, navigate, type Route } from './lib/router'
import './App.css'

function App() {
  const { sessions, loading, error } = useSessions()
  const [showEur, setShowEur] = useState(false)
  const [filters, setFilters] = useState<Filters>({ model: '', dateFrom: '', dateTo: '', minCost: '' })

  // Router state
  const [route, setRoute] = useState<Route>(() => {
    const { route, params } = parseRoute(location.pathname, location.search, location.hash)
    // Apply date filter from URL
    if (params.dateFilter) {
      setTimeout(() => setFilters(f => ({ ...f, dateFrom: params.dateFilter!, dateTo: params.dateFilter! })), 0)
    }
    return route
  })

  useEffect(() => {
    const handler = () => {
      const { route: newRoute, params } = parseRoute(location.pathname, location.search, location.hash)
      setRoute(newRoute)
      if (params.dateFilter) {
        setFilters(f => ({ ...f, dateFrom: params.dateFilter!, dateTo: params.dateFilter! }))
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const convertCurrency = useCallback((usd: number) => showEur ? usd * USD_TO_EUR : usd, [showEur])
  const currencySymbol = showEur ? '\u20ac' : '$'

  function navTo(r: Route) {
    navigate(r)
  }

  function handleSelectSession(session: Session) {
    navigate({ view: 'session', id: session.id })
  }

  function handleDayClick(date: string) {
    // Bypasses navigate() because it needs to set ?date= query param
    // which the router doesn't support. Filters are set directly instead
    // of relying on the popstate handler's param parsing.
    history.pushState({}, '', `/sessions?date=${date}`)
    setFilters(f => ({ ...f, dateFrom: date, dateTo: date }))
    setRoute({ view: 'sessions' })
  }

  // Find selected session by ID
  const selectedSession = route.view === 'session'
    ? sessions.find(s => s.id === route.id) ?? null
    : null

  const activeView = route.view === 'session' ? 'sessions' : route.view as string

  if (loading) return <div className="loading">Loading sessions...</div>
  if (error) return <div className="error">Error: {error}</div>

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={() => navTo({ view: 'sessions' })} style={{ cursor: 'pointer' }}>Claude Cost Tracker</h1>
        <div className="header-controls">
          <nav className="tab-buttons">
            <a href="/sessions" className={activeView === 'sessions' ? 'active' : ''} onClick={e => { e.preventDefault(); navTo({ view: 'sessions' }) }}>Sessions</a>
            <a href="/tools" className={activeView === 'tools' ? 'active' : ''} onClick={e => { e.preventDefault(); navTo({ view: 'tools' }) }}>Tools</a>
            <a href="/charts" className={activeView === 'charts' ? 'active' : ''} onClick={e => { e.preventDefault(); navTo({ view: 'charts' }) }}>Charts</a>
            <a href="/cache" className={activeView === 'cache' ? 'active' : ''} onClick={e => { e.preventDefault(); navTo({ view: 'cache' }) }}>Cache</a>
          </nav>
          <button
            className={`currency-toggle ${showEur ? 'eur' : 'usd'}`}
            onClick={() => setShowEur(!showEur)}
          >
            {showEur ? '\u20ac EUR' : '$ USD'}
          </button>
        </div>
      </header>

      <main>
        {selectedSession ? (
          <SessionDetail
            session={selectedSession}
            onBack={() => navTo({ view: 'sessions' })}
            convertCurrency={convertCurrency}
            currencySymbol={currencySymbol}
            initialAgentId={route.view === 'session' ? route.agentId : undefined}
          />
        ) : route.view === 'session' ? (
          <div className="error" style={{ height: 'auto', padding: 40 }}>
            Session not found. <a href="/sessions" onClick={e => { e.preventDefault(); navTo({ view: 'sessions' }) }} style={{ color: 'var(--accent)' }}>Back to sessions</a>
          </div>
        ) : route.view === 'charts' ? (
          <Charts
            sessions={sessions}
            convertCurrency={convertCurrency}
            currencySymbol={currencySymbol}
            onDayClick={handleDayClick}
          />
        ) : route.view === 'cache' ? (
          <Cache
            sessions={sessions}
            filters={filters}
            setFilters={setFilters}
            convertCurrency={convertCurrency}
            currencySymbol={currencySymbol}
          />
        ) : route.view === 'tools' ? (
          <Tools
            sessions={sessions}
            filters={filters}
            setFilters={setFilters}
            convertCurrency={convertCurrency}
            currencySymbol={currencySymbol}
          />
        ) : (
          <SessionList
            sessions={sessions}
            onSelectSession={handleSelectSession}
            filters={filters}
            setFilters={setFilters}
            convertCurrency={convertCurrency}
            currencySymbol={currencySymbol}
          />
        )}
      </main>
    </div>
  )
}

export default App
