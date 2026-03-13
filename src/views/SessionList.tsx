import { useState, useMemo } from 'react'
import type { Session } from '../lib/types'
import { type Filters, filterSessions } from '../lib/filters'
import { formatDuration, formatTokens, formatCostShort, shortenPath } from '../lib/format'

interface Props {
  sessions: Session[]
  onSelectSession: (session: Session) => void
  filters: Filters
  setFilters: (f: Filters) => void
  convertCurrency: (usd: number) => number
  currencySymbol: string
}

type SortKey = 'date' | 'model' | 'messages' | 'duration' | 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'cost' | 'subAgents'
type SortDir = 'asc' | 'desc'

function modelDisplay(session: Session): { primary: string; lines: Array<{ name: string; pct: number }> } {
  const counts = session.modelCounts || {}
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  if (total === 0) {
    const name = session.models[0]?.replace(/^claude-/, '') || '-'
    return { primary: name, lines: [{ name, pct: 100 }] }
  }
  const lines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([m, count]) => ({ name: m.replace(/^claude-/, ''), pct: Math.round(count / total * 100) }))
  return { primary: lines[0].name, lines }
}

export function SessionList({ sessions, onSelectSession, filters, setFilters, convertCurrency, currencySymbol }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const uniqueModels = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => s.models.forEach(m => set.add(m)))
    return Array.from(set).sort()
  }, [sessions])

  const filtered = useMemo(
    () => filterSessions(sessions, filters, convertCurrency),
    [sessions, filters, convertCurrency],
  )

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const dir = sortDir === 'asc' ? 1 : -1

    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'date': cmp = new Date(a.startTime).getTime() - new Date(b.startTime).getTime(); break
        case 'model': cmp = modelDisplay(a).primary.localeCompare(modelDisplay(b).primary); break
        case 'messages': cmp = a.messages.length - b.messages.length; break
        case 'duration': cmp = a.duration - b.duration; break
        case 'input': cmp = a.totalInputTokens - b.totalInputTokens; break
        case 'output': cmp = a.totalOutputTokens - b.totalOutputTokens; break
        case 'cacheRead': cmp = a.totalCacheReadTokens - b.totalCacheReadTokens; break
        case 'cacheWrite': cmp = (a.totalCacheCreation5mTokens + a.totalCacheCreation1hTokens) - (b.totalCacheCreation5mTokens + b.totalCacheCreation1hTokens); break
        case 'cost': cmp = a.totalCostUSD - b.totalCostUSD; break
        case 'subAgents': cmp = a.subAgents.length - b.subAgents.length; break
      }
      return cmp * dir
    })

    return copy
  }, [filtered, sortKey, sortDir])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, s) => ({
        messages: acc.messages + s.messages.length,
        duration: acc.duration + s.duration,
        input: acc.input + s.totalInputTokens,
        output: acc.output + s.totalOutputTokens,
        cacheRead: acc.cacheRead + s.totalCacheReadTokens,
        cacheWrite: acc.cacheWrite + s.totalCacheCreation5mTokens + s.totalCacheCreation1hTokens,
        cost: acc.cost + s.totalCostUSD,
        subAgents: acc.subAgents + s.subAgents.length,
      }),
      { messages: 0, duration: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, subAgents: 0 }
    )
  }, [filtered])

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

  function exportCSV() {
    const headers = ['Date', 'Model', 'Working Dir', 'Messages', 'Duration', 'Input Tokens', 'Output Tokens', 'Cache Read', 'Cache Write', 'Cost', 'Main Cost', 'Agent Cost', 'Sub-agents']
    const rows = sorted.map(s => {
      const agentCost = s.subAgents.reduce((sum, sa) => sum + sa.totalCostUSD, 0)
      const mainCost = s.totalCostUSD - agentCost
      return [
        s.startTime,
        s.models.join('; '),
        s.cwd,
        s.messages.length,
        formatDuration(s.duration),
        s.totalInputTokens,
        s.totalOutputTokens,
        s.totalCacheReadTokens,
        s.totalCacheCreation5mTokens + s.totalCacheCreation1hTokens,
        convertCurrency(s.totalCostUSD).toFixed(2),
        convertCurrency(mainCost).toFixed(2),
        convertCurrency(agentCost).toFixed(2),
        s.subAgents.length,
      ]
    })
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    downloadBlob(csv, 'sessions.csv', 'text/csv')
  }

  function exportJSON() {
    const data = sorted.map(s => {
      const agentCost = s.subAgents.reduce((sum, sa) => sum + sa.totalCostUSD, 0)
      return {
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        models: s.models,
        modelCounts: s.modelCounts,
        cwd: s.cwd,
        gitBranch: s.gitBranch,
        messages: s.messages.length,
        duration: s.duration,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        totalCacheReadTokens: s.totalCacheReadTokens,
        totalCostUSD: s.totalCostUSD,
        mainCostUSD: s.totalCostUSD - agentCost,
        agentCostUSD: agentCost,
        subAgents: s.subAgents.length,
      }
    })
    downloadBlob(JSON.stringify(data, null, 2), 'sessions.json', 'application/json')
  }

  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <span className="muted">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</span>
        <div style={{ marginLeft: 'auto' }} className="export-buttons">
          <button onClick={exportCSV}>Export CSV</button>
          <button onClick={exportJSON}>Export JSON</button>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th onClick={() => handleSort('date')}>Date{sortIndicator('date')}</th>
            <th onClick={() => handleSort('model')}>Model{sortIndicator('model')}</th>
            <th>Project</th>
            <th className="num" onClick={() => handleSort('messages')}>Msgs{sortIndicator('messages')}</th>
            <th className="num" onClick={() => handleSort('duration')}>Duration{sortIndicator('duration')}</th>
            <th className="num" onClick={() => handleSort('input')}>Input{sortIndicator('input')}</th>
            <th className="num" onClick={() => handleSort('output')}>Output{sortIndicator('output')}</th>
            <th className="num" onClick={() => handleSort('cacheRead')}>Cache R{sortIndicator('cacheRead')}</th>
            <th className="num" onClick={() => handleSort('cacheWrite')}>Cache W{sortIndicator('cacheWrite')}</th>
            <th className="num" onClick={() => handleSort('cost')}>Cost{sortIndicator('cost')}</th>
            <th className="num" onClick={() => handleSort('subAgents')}>Agents{sortIndicator('subAgents')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="summary-row">
            <td colSpan={3}>Total ({filtered.length} sessions)</td>
            <td className="num">{totals.messages}</td>
            <td className="num">{formatDuration(totals.duration)}</td>
            <td className="num">{formatTokens(totals.input)}</td>
            <td className="num">{formatTokens(totals.output)}</td>
            <td className="num">{formatTokens(totals.cacheRead)}</td>
            <td className="num">{formatTokens(totals.cacheWrite)}</td>
            <td className="num cost">{formatCostShort(convertCurrency(totals.cost), currencySymbol)}</td>
            <td className="num">{totals.subAgents}</td>
          </tr>
          {sorted.map(s => {
            const agentCost = s.subAgents.reduce((sum, sa) => sum + sa.totalCostUSD, 0)
            const mainCost = s.totalCostUSD - agentCost
            const hasAgents = s.subAgents.length > 0
            const md = modelDisplay(s)

            return (
              <tr key={s.id} onClick={() => onSelectSession(s)} style={{ cursor: 'pointer' }}>
                <td>{new Date(s.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                <td>
                  {md.lines.length <= 1 ? (
                    md.primary
                  ) : (
                    <div className="stacked-cell">
                      {md.lines.map((l, i) => (
                        <div key={i} className={i > 0 ? 'stacked-sub' : ''}>{l.name} ({l.pct}%)</div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="muted" title={s.cwd}>{shortenPath(s.cwd).split('/').pop() || shortenPath(s.cwd)}</td>
                <td className="num">{s.messages.length}</td>
                <td className="num">{formatDuration(s.duration)}</td>
                <td className="num">{formatTokens(s.totalInputTokens)}</td>
                <td className="num">{formatTokens(s.totalOutputTokens)}</td>
                <td className="num">{formatTokens(s.totalCacheReadTokens)}</td>
                <td className="num">{formatTokens(s.totalCacheCreation5mTokens + s.totalCacheCreation1hTokens)}</td>
                <td className="num cost">
                  {hasAgents ? (
                    <div className="stacked-cell">
                      <div><strong>{formatCostShort(convertCurrency(s.totalCostUSD), currencySymbol)}</strong></div>
                      <div className="stacked-sub">{formatCostShort(convertCurrency(mainCost), currencySymbol)} + {formatCostShort(convertCurrency(agentCost), currencySymbol)}</div>
                    </div>
                  ) : (
                    formatCostShort(convertCurrency(s.totalCostUSD), currencySymbol)
                  )}
                </td>
                <td className="num">{s.subAgents.length || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
