import { useState, useMemo } from 'react'
import type { Session } from '../lib/types'
import { type Filters, filterSessions } from '../lib/filters'
import { formatCostShort } from '../lib/format'

interface Props {
  sessions: Session[]
  filters: Filters
  setFilters: (f: Filters) => void
  convertCurrency: (usd: number) => number
  currencySymbol: string
}

type SortKey = 'tool' | 'server' | 'calls' | 'errors' | 'errorPct' | 'cost' | 'sessions'
type SortDir = 'asc' | 'desc'

interface ToolStat {
  tool: string
  server: string
  action: string
  callCount: number
  errorCount: number
  assocCostUSD: number
  sessionCount: number
}

function parseToolName(name: string): { server: string; action: string } {
  const mcpMatch = name.match(/^mcp__([^_]+)__(.+)$/)
  if (mcpMatch) return { server: mcpMatch[1], action: mcpMatch[2] }
  return { server: 'Built-in', action: name }
}

const formatCost = formatCostShort

export function Tools({ sessions, filters, setFilters, convertCurrency, currencySymbol }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('calls')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [collapsedServers, setCollapsedServers] = useState<Set<string>>(new Set())

  const uniqueModels = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => s.models.forEach(m => set.add(m)))
    return Array.from(set).sort()
  }, [sessions])

  const filtered = useMemo(
    () => filterSessions(sessions, filters, convertCurrency),
    [sessions, filters, convertCurrency],
  )

  // Aggregate tool stats across all filtered sessions
  const toolStats = useMemo(() => {
    const map = new Map<string, { callCount: number; errorCount: number; assocCostUSD: number; sessionIds: Set<string> }>()

    for (const session of filtered) {
      const allMessages = [...session.messages, ...session.subAgents.flatMap(sa => sa.messages)]
      for (const msg of allMessages) {
        // Track tool calls
        for (const tc of msg.toolCalls) {
          let entry = map.get(tc)
          if (!entry) {
            entry = { callCount: 0, errorCount: 0, assocCostUSD: 0, sessionIds: new Set() }
            map.set(tc, entry)
          }
          entry.callCount++
          entry.assocCostUSD += msg.costUSD
          entry.sessionIds.add(session.id)
        }
        // Track errors from tool results
        for (const tr of msg.toolResults) {
          if (tr.isError) {
            const entry = map.get(tr.name)
            if (entry) entry.errorCount++
          }
        }
      }
    }

    const stats: ToolStat[] = []
    for (const [tool, data] of map) {
      const { server, action } = parseToolName(tool)
      stats.push({
        tool,
        server,
        action,
        callCount: data.callCount,
        errorCount: data.errorCount,
        assocCostUSD: data.assocCostUSD,
        sessionCount: data.sessionIds.size,
      })
    }
    return stats
  }, [filtered])

  // Group by server
  const serverGroups = useMemo(() => {
    const groups = new Map<string, ToolStat[]>()
    for (const stat of toolStats) {
      const existing = groups.get(stat.server) || []
      existing.push(stat)
      groups.set(stat.server, existing)
    }
    // Sort tools within each group
    for (const tools of groups.values()) {
      tools.sort((a, b) => b.callCount - a.callCount)
    }
    // Sort groups by total call count
    return [...groups.entries()].sort((a, b) => {
      const aCalls = a[1].reduce((s, t) => s + t.callCount, 0)
      const bCalls = b[1].reduce((s, t) => s + t.callCount, 0)
      return bCalls - aCalls
    })
  }, [toolStats])

  // Flat sorted list for the table
  const sorted = useMemo(() => {
    const copy = [...toolStats]
    const dir = sortDir === 'asc' ? 1 : -1
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'tool': cmp = a.tool.localeCompare(b.tool); break
        case 'server': cmp = a.server.localeCompare(b.server); break
        case 'calls': cmp = a.callCount - b.callCount; break
        case 'errors': cmp = a.errorCount - b.errorCount; break
        case 'errorPct': cmp = (a.errorCount / a.callCount) - (b.errorCount / b.callCount); break
        case 'cost': cmp = a.assocCostUSD - b.assocCostUSD; break
        case 'sessions': cmp = a.sessionCount - b.sessionCount; break
      }
      return cmp * dir
    })
    return copy
  }, [toolStats, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' \u25b2' : ' \u25bc'
  }

  function toggleServer(server: string) {
    setCollapsedServers(prev => {
      const next = new Set(prev)
      if (next.has(server)) next.delete(server)
      else next.add(server)
      return next
    })
  }

  const totalCalls = toolStats.reduce((s, t) => s + t.callCount, 0)
  const totalErrors = toolStats.reduce((s, t) => s + t.errorCount, 0)

  return (
    <div>
      <div className="filter-bar">
        <select value={filters.model} onChange={e => setFilters({ ...filters, model: e.target.value })}>
          <option value="">All Models</option>
          {uniqueModels.map(m => (
            <option key={m} value={m}>{m.replace(/^claude-/, '')}</option>
          ))}
        </select>
        <input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} placeholder="From" />
        <input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} placeholder="To" />
        <input
          type="number"
          step="0.01"
          min="0"
          value={filters.minCost}
          onChange={e => setFilters({ ...filters, minCost: e.target.value })}
          placeholder={`Min cost (${currencySymbol})`}
          style={{ width: '120px' }}
        />
        <span className="muted">{filtered.length} session{filtered.length !== 1 ? 's' : ''} · {toolStats.length} tools · {totalCalls} calls</span>
      </div>

      {/* Grouped view */}
      <div style={{ marginBottom: 24 }}>
        {serverGroups.map(([server, tools]) => {
          const isCollapsed = collapsedServers.has(server)
          const serverCalls = tools.reduce((s, t) => s + t.callCount, 0)
          const serverErrors = tools.reduce((s, t) => s + t.errorCount, 0)
          const serverCost = tools.reduce((s, t) => s + t.assocCostUSD, 0)

          return (
            <div key={server} className="tool-server-group">
              <div className="tool-server-header" onClick={() => toggleServer(server)}>
                <span>{isCollapsed ? '▶' : '▼'} <strong>{server}</strong></span>
                <span className="muted">
                  {tools.length} tools · {serverCalls} calls
                  {serverErrors > 0 && <span style={{ color: 'var(--red)' }}> · {serverErrors} errors</span>}
                  {' · '}{formatCost(convertCurrency(serverCost), currencySymbol)}
                </span>
              </div>
              {!isCollapsed && (
                <table>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th className="num">Calls</th>
                      <th className="num">Errors</th>
                      <th className="num">Error %</th>
                      <th className="num">Assoc. Cost</th>
                      <th className="num">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map(t => (
                      <tr key={t.tool}>
                        <td>{t.action}</td>
                        <td className="num">{t.callCount}</td>
                        <td className="num" style={{ color: t.errorCount > 0 ? 'var(--red)' : undefined }}>{t.errorCount || '-'}</td>
                        <td className="num" style={{ color: t.errorCount > 0 ? 'var(--red)' : undefined }}>
                          {t.errorCount > 0 ? `${(t.errorCount / t.callCount * 100).toFixed(1)}%` : '-'}
                        </td>
                        <td className="num cost">{formatCost(convertCurrency(t.assocCostUSD), currencySymbol)}</td>
                        <td className="num">{t.sessionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>

      {/* Flat sortable table */}
      <h3 style={{ margin: '24px 0 8px' }}>All Tools (flat view)</h3>
      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Associated cost counts the full message cost for each tool used in that message. Totals may exceed actual spend when messages use multiple tools.
      </p>
      <table>
        <thead>
          <tr>
            <th onClick={() => handleSort('tool')}>Tool{sortIndicator('tool')}</th>
            <th onClick={() => handleSort('server')}>MCP Server{sortIndicator('server')}</th>
            <th className="num" onClick={() => handleSort('calls')}>Calls{sortIndicator('calls')}</th>
            <th className="num" onClick={() => handleSort('errors')}>Errors{sortIndicator('errors')}</th>
            <th className="num" onClick={() => handleSort('errorPct')}>Error %{sortIndicator('errorPct')}</th>
            <th className="num" onClick={() => handleSort('cost')}>Assoc. Cost{sortIndicator('cost')}</th>
            <th className="num" onClick={() => handleSort('sessions')}>Sessions{sortIndicator('sessions')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="summary-row">
            <td colSpan={2}>Total ({toolStats.length} tools)</td>
            <td className="num">{totalCalls}</td>
            <td className="num">{totalErrors}</td>
            <td className="num">{totalCalls > 0 ? `${(totalErrors / totalCalls * 100).toFixed(1)}%` : '-'}</td>
            <td className="num cost">-</td>
            <td className="num">{filtered.length}</td>
          </tr>
          {sorted.map(t => (
            <tr key={t.tool}>
              <td>{t.tool}</td>
              <td className="muted">{t.server}</td>
              <td className="num">{t.callCount}</td>
              <td className="num" style={{ color: t.errorCount > 0 ? 'var(--red)' : undefined }}>{t.errorCount || '-'}</td>
              <td className="num" style={{ color: t.errorCount > 0 ? 'var(--red)' : undefined }}>
                {t.errorCount > 0 ? `${(t.errorCount / t.callCount * 100).toFixed(1)}%` : '-'}
              </td>
              <td className="num cost">{formatCost(convertCurrency(t.assocCostUSD), currencySymbol)}</td>
              <td className="num">{t.sessionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
