import { useMemo } from 'react'
import type { Session, SessionCacheStrategies } from '../lib/types'
import type { Filters } from '../lib/filters'
import { filterSessions } from '../lib/filters'
import { analyzeSessionStrategies } from '../lib/pricing'
import { formatCostShort } from '../lib/format'

interface Props {
  sessions: Session[]
  filters: Filters
  setFilters: (f: Filters) => void
  convertCurrency: (usd: number) => number
  currencySymbol: string
}

interface GroupedStrategies {
  label: string
  count: number
  current: number
  all5min: number
  all1h: number
  hybrid: number
  expirations5m: number
  expirations1h: number
  hybridExpirations: number
}

function sumStrategies(strategies: SessionCacheStrategies[]): Omit<GroupedStrategies, 'label'> {
  return strategies.reduce((acc, s) => ({
    count: acc.count + 1,
    current: acc.current + s.current,
    all5min: acc.all5min + s.all5min,
    all1h: acc.all1h + s.all1h,
    hybrid: acc.hybrid + s.hybrid,
    expirations5m: acc.expirations5m + s.expirations5m,
    expirations1h: acc.expirations1h + s.expirations1h,
    hybridExpirations: acc.hybridExpirations + s.hybridExpirations,
  }), { count: 0, current: 0, all5min: 0, all1h: 0, hybrid: 0, expirations5m: 0, expirations1h: 0, hybridExpirations: 0 })
}

function cheapestClass(_current: number, val: number, all: number[]): string {
  const min = Math.min(...all)
  if (Math.abs(val - min) < 0.001) return ' cost'
  return ''
}

function savingsText(current: number, val: number, convertCurrency: (n: number) => number, sym: string): string {
  const diff = current - val
  if (Math.abs(diff) < 0.01) return '—'
  const pct = current > 0 ? Math.round(diff / current * 100) : 0
  const prefix = diff > 0 ? '' : '+'
  return `${prefix}${formatCostShort(convertCurrency(diff), sym)} (${prefix}${pct}%)`
}

function StrategyTable({ group, convertCurrency, currencySymbol }: {
  group: GroupedStrategies
  convertCurrency: (n: number) => number
  currencySymbol: string
}) {
  const costs = [group.current, group.all5min, group.all1h, group.hybrid]

  return (
    <table className="cache-strategy-table">
      <thead>
        <tr>
          <th></th>
          <th className="num">Current</th>
          <th className="num">All 5-min</th>
          <th className="num">All 1-hour</th>
          <th className="num">Hybrid (1h main + 5m agents)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="muted">Total cost</td>
          <td className={`num${cheapestClass(group.current, group.current, costs)}`}>
            {formatCostShort(convertCurrency(group.current), currencySymbol)}
          </td>
          <td className={`num${cheapestClass(group.current, group.all5min, costs)}`}>
            {formatCostShort(convertCurrency(group.all5min), currencySymbol)}
          </td>
          <td className={`num${cheapestClass(group.current, group.all1h, costs)}`}>
            {formatCostShort(convertCurrency(group.all1h), currencySymbol)}
          </td>
          <td className={`num${cheapestClass(group.current, group.hybrid, costs)}`}>
            {formatCostShort(convertCurrency(group.hybrid), currencySymbol)}
          </td>
        </tr>
        <tr>
          <td className="muted">vs. current</td>
          <td className="num muted">—</td>
          <td className="num">{savingsText(group.current, group.all5min, convertCurrency, currencySymbol)}</td>
          <td className="num">{savingsText(group.current, group.all1h, convertCurrency, currencySymbol)}</td>
          <td className="num">{savingsText(group.current, group.hybrid, convertCurrency, currencySymbol)}</td>
        </tr>
        <tr>
          <td className="muted">Cache expirations</td>
          <td className="num muted">—</td>
          <td className="num">{group.expirations5m}</td>
          <td className="num">{group.expirations1h}</td>
          <td className="num">{group.hybridExpirations}</td>
        </tr>
      </tbody>
    </table>
  )
}

function BreakdownTable({ groups, convertCurrency, currencySymbol }: {
  groups: GroupedStrategies[]
  convertCurrency: (n: number) => number
  currencySymbol: string
}) {
  return (
    <table className="cache-breakdown-table">
      <thead>
        <tr>
          <th>Range</th>
          <th className="num">Sessions</th>
          <th className="num">Current</th>
          <th className="num">All 5-min</th>
          <th className="num">All 1-hour</th>
          <th className="num">Hybrid</th>
          <th className="num">Best strategy</th>
        </tr>
      </thead>
      <tbody>
        {groups.map(g => {
          if (g.count === 0) return null
          const costs = [
            { label: 'Current', val: g.current },
            { label: 'All 5-min', val: g.all5min },
            { label: 'All 1-hour', val: g.all1h },
            { label: 'Hybrid', val: g.hybrid },
          ]
          const best = costs.reduce((a, b) => a.val < b.val ? a : b)
          const savingsVsCurrent = g.current - best.val
          const pct = g.current > 0 ? Math.round(savingsVsCurrent / g.current * 100) : 0

          return (
            <tr key={g.label}>
              <td>{g.label}</td>
              <td className="num">{g.count}</td>
              <td className={`num${g.current === best.val ? ' cost' : ''}`}>
                {formatCostShort(convertCurrency(g.current), currencySymbol)}
              </td>
              <td className={`num${g.all5min === best.val ? ' cost' : ''}`}>
                {formatCostShort(convertCurrency(g.all5min), currencySymbol)}
              </td>
              <td className={`num${g.all1h === best.val ? ' cost' : ''}`}>
                {formatCostShort(convertCurrency(g.all1h), currencySymbol)}
              </td>
              <td className={`num${g.hybrid === best.val ? ' cost' : ''}`}>
                {formatCostShort(convertCurrency(g.hybrid), currencySymbol)}
              </td>
              <td className="num">
                {savingsVsCurrent > 0.01
                  ? <span className="cost">{best.label} ({formatCostShort(convertCurrency(savingsVsCurrent), currencySymbol)} / {pct}%)</span>
                  : <span className="muted">Current is optimal</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

const PEAK_CONTEXT_RANGES = [
  { label: '< 50K', max: 50_000 },
  { label: '50K – 100K', max: 100_000 },
  { label: '100K – 200K', max: 200_000 },
  { label: '200K – 500K', max: 500_000 },
  { label: '> 500K', max: Infinity },
]

const BILLING_VOLUME_RANGES = [
  { label: '< 100K', max: 100_000 },
  { label: '100K – 500K', max: 500_000 },
  { label: '500K – 2M', max: 2_000_000 },
  { label: '2M – 10M', max: 10_000_000 },
  { label: '> 10M', max: Infinity },
]

const DURATION_RANGES = [
  { label: '< 15 min', max: 15 * 60 * 1000 },
  { label: '15 min – 1h', max: 60 * 60 * 1000 },
  { label: '1h – 3h', max: 3 * 60 * 60 * 1000 },
  { label: '> 3h', max: Infinity },
]

const MSG_COUNT_RANGES = [
  { label: '1 – 5 msgs', max: 6 },
  { label: '6 – 20 msgs', max: 21 },
  { label: '21 – 50 msgs', max: 51 },
  { label: '51 – 100 msgs', max: 101 },
  { label: '> 100 msgs', max: Infinity },
]

const AVG_GAP_RANGES = [
  { label: '< 1 min avg gap', max: 60_000 },
  { label: '1 – 5 min', max: 5 * 60_000 },
  { label: '5 – 15 min', max: 15 * 60_000 },
  { label: '15 – 60 min', max: 60 * 60_000 },
  { label: '> 60 min', max: Infinity },
]

function getPeakContext(session: Session): number {
  const allMsgs = [...session.messages, ...session.subAgents.flatMap(sa => sa.messages)]
  let max = 0
  for (const m of allMsgs) {
    const total = m.inputTokens + m.cacheReadTokens + m.cacheCreation5mTokens + m.cacheCreation1hTokens
    if (total > max) max = total
  }
  return max
}

function getAvgGap(session: Session): number {
  const assistantMsgs = session.messages
    .filter(m => m.role === 'assistant')
    .map(m => new Date(m.timestamp).getTime())
    .sort((a, b) => a - b)
  if (assistantMsgs.length < 2) return 0
  let totalGap = 0
  for (let i = 1; i < assistantMsgs.length; i++) {
    totalGap += assistantMsgs[i] - assistantMsgs[i - 1]
  }
  return totalGap / (assistantMsgs.length - 1)
}

export function Cache({ sessions, filters, setFilters, convertCurrency, currencySymbol }: Props) {
  const filtered = useMemo(() => filterSessions(sessions, filters, convertCurrency), [sessions, filters, convertCurrency])

  // Compute strategies for all filtered sessions
  const allStrategies = useMemo(() =>
    filtered.map(s => ({ session: s, strategies: analyzeSessionStrategies(s) })),
    [filtered]
  )

  // Overview stats
  const overview = useMemo(() => {
    let using5m = 0, using1h = 0, mixed = 0, none = 0
    for (const { strategies } of allStrategies) {
      switch (strategies.detectedTTL) {
        case '5min': using5m++; break
        case '1h': using1h++; break
        case 'mixed': mixed++; break
        case 'none': none++; break
      }
    }
    return { total: filtered.length, using5m, using1h, mixed, none }
  }, [allStrategies, filtered])

  // Aggregate totals
  const totals = useMemo(() => {
    const s = sumStrategies(allStrategies.map(a => a.strategies))
    return { ...s, label: `All ${s.count} sessions` } as GroupedStrategies
  }, [allStrategies])

  // Helper to group sessions by a numeric metric
  function groupBy(ranges: Array<{ label: string; max: number }>, metricFn: (s: Session) => number): GroupedStrategies[] {
    return ranges.map(range => {
      const prev = ranges[ranges.indexOf(range) - 1]
      const min = prev ? prev.max : 0
      const matching = allStrategies.filter(({ session }) => {
        const val = metricFn(session)
        return val >= min && val < range.max
      })
      return { label: range.label, ...sumStrategies(matching.map(m => m.strategies)) } as GroupedStrategies
    })
  }

  // Group by peak context size (max input tokens in a single API call)
  const byPeakContext = useMemo(() =>
    groupBy(PEAK_CONTEXT_RANGES, getPeakContext),
    [allStrategies]
  )

  // Group by billing volume (total tokens across all API calls)
  const byBillingVolume = useMemo(() =>
    groupBy(BILLING_VOLUME_RANGES, s =>
      s.totalInputTokens + s.totalOutputTokens + s.totalCacheReadTokens +
      s.totalCacheCreation5mTokens + s.totalCacheCreation1hTokens
    ),
    [allStrategies]
  )

  // Group by duration
  const byDuration = useMemo(() =>
    groupBy(DURATION_RANGES, s => s.duration),
    [allStrategies]
  )

  // Group by message count
  const byMessageCount = useMemo(() =>
    groupBy(MSG_COUNT_RANGES, s => s.messages.length),
    [allStrategies]
  )

  // Group by average gap between messages
  const byAvgGap = useMemo(() =>
    groupBy(AVG_GAP_RANGES, getAvgGap),
    [allStrategies]
  )

  // Unique models for filter
  const models = useMemo(() => {
    const s = new Set<string>()
    for (const sess of sessions) for (const m of sess.models) s.add(m)
    return [...s].sort()
  }, [sessions])

  function fmtC(usd: number): string {
    return formatCostShort(convertCurrency(usd), currencySymbol)
  }

  function breakdownMd(title: string, subtitle: string, groups: GroupedStrategies[]): string {
    const rows = groups.filter(g => g.count > 0)
    if (rows.length === 0) return ''
    const lines = [`### ${title}`, subtitle ? `_${subtitle}_` : '', '']
    lines.push(`| Range | Sessions | Current | All 5-min | All 1-hour | Hybrid | Best |`)
    lines.push(`|-------|----------|---------|-----------|------------|--------|------|`)
    for (const g of rows) {
      const costs = [
        { label: 'Current', val: g.current },
        { label: 'All 5-min', val: g.all5min },
        { label: 'All 1-hour', val: g.all1h },
        { label: 'Hybrid', val: g.hybrid },
      ]
      const best = costs.reduce((a, b) => a.val < b.val ? a : b)
      const saving = g.current - best.val
      const pct = g.current > 0 ? Math.round(saving / g.current * 100) : 0
      const bestText = saving > 0.01 ? `${best.label} (${fmtC(saving)} / ${pct}%)` : 'Current'
      lines.push(`| ${g.label} | ${g.count} | ${fmtC(g.current)} | ${fmtC(g.all5min)} | ${fmtC(g.all1h)} | ${fmtC(g.hybrid)} | ${bestText} |`)
    }
    lines.push('')
    return lines.join('\n')
  }

  function generateReport(): string {
    const now = new Date().toISOString().slice(0, 10)
    const dateRange = filters.dateFrom || filters.dateTo
      ? ` | Period: ${filters.dateFrom || 'start'} to ${filters.dateTo || 'now'}`
      : ''
    const modelFilter = filters.model ? ` | Model: ${filters.model.replace('claude-', '')}` : ''

    // Find best strategy overall
    const strategies = [
      { label: 'All 5-min cache', val: totals.all5min },
      { label: 'All 1-hour cache', val: totals.all1h },
      { label: 'Hybrid (1h main + 5m agents)', val: totals.hybrid },
    ]
    const best = strategies.reduce((a, b) => a.val < b.val ? a : b)
    const savingsVsCurrent = totals.current - best.val
    const pctSavings = totals.current > 0 ? Math.round(savingsVsCurrent / totals.current * 100) : 0

    const lines: string[] = []
    lines.push(`# Cache Strategy Report`)
    lines.push(`Generated: ${now} | Sessions analyzed: ${totals.count}${dateRange}${modelFilter}`)
    lines.push('')

    if (savingsVsCurrent > 0.01) {
      lines.push(`## Recommendation: Switch to ${best.label}`)
      lines.push(`Estimated savings: **${fmtC(savingsVsCurrent)} (${pctSavings}%)**`)
    } else {
      lines.push(`## Recommendation: Current setup is already optimal`)
    }
    lines.push('')

    // Overview
    lines.push(`## Current Cache Usage`)
    lines.push(`- Sessions using 5-min cache: ${overview.using5m}`)
    lines.push(`- Sessions using 1-hour cache: ${overview.using1h}`)
    lines.push(`- Sessions using mixed cache: ${overview.mixed}`)
    lines.push(`- Sessions with no cache: ${overview.none}`)
    lines.push('')

    // Strategy comparison
    lines.push(`## Strategy Comparison`)
    lines.push(`| Strategy | Cost | vs. Current | Cache Expirations |`)
    lines.push(`|----------|------|-------------|-------------------|`)
    lines.push(`| Current | ${fmtC(totals.current)} | — | — |`)
    const s5 = totals.current - totals.all5min
    lines.push(`| All 5-min | ${fmtC(totals.all5min)} | ${s5 > 0.01 ? fmtC(s5) + ' savings' : s5 < -0.01 ? '+' + fmtC(-s5) + ' more' : 'same'} | ${totals.expirations5m} |`)
    const s1 = totals.current - totals.all1h
    lines.push(`| All 1-hour | ${fmtC(totals.all1h)} | ${s1 > 0.01 ? fmtC(s1) + ' savings' : s1 < -0.01 ? '+' + fmtC(-s1) + ' more' : 'same'} | ${totals.expirations1h} |`)
    const sh = totals.current - totals.hybrid
    lines.push(`| Hybrid (1h main + 5m agents) | ${fmtC(totals.hybrid)} | ${sh > 0.01 ? fmtC(sh) + ' savings' : sh < -0.01 ? '+' + fmtC(-sh) + ' more' : 'same'} | ${totals.hybridExpirations} |`)
    lines.push('')

    // Breakdowns
    lines.push(breakdownMd('By Peak Context Size', 'max input tokens in a single API call', byPeakContext))
    lines.push(breakdownMd('By Avg Gap Between Messages', 'directly predicts cache expiry impact — the key metric', byAvgGap))
    lines.push(breakdownMd('By Session Duration', '', byDuration))
    lines.push(breakdownMd('By Message Count', '', byMessageCount))
    lines.push(breakdownMd('By Billing Volume', 'cumulative tokens across all API calls', byBillingVolume))

    // Methodology
    lines.push(`## Methodology`)
    lines.push(`- **Current**: actual cost recorded from API usage data`)
    lines.push(`- **All 5-min**: simulated cost assuming all cache writes use 5-minute TTL (1.25x input price, expires after 5 min idle)`)
    lines.push(`- **All 1-hour**: simulated cost assuming all cache writes use 1-hour TTL (2x input price, expires after 1 hour idle)`)
    lines.push(`- **Hybrid**: 1-hour cache for main session, 5-minute cache for sub-agents`)
    lines.push(`- Cache read cost is 0.1x input price regardless of TTL`)
    lines.push(`- Each sub-agent has an independent cache context`)
    lines.push(`- Simulation assumes cache hits within TTL (actual hit rate may be slightly lower due to 20-block lookback limit and invalidation)`)
    lines.push('')

    return lines.join('\n')
  }

  function handleExportReport() {
    const report = generateReport()
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cache-strategy-report-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleCopyReport() {
    const report = generateReport()
    navigator.clipboard.writeText(report)
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Cache Strategy Analysis</h2>

      {/* Filters */}
      <div className="filter-bar">
        <select value={filters.model} onChange={e => setFilters({ ...filters, model: e.target.value })}>
          <option value="">All Models</option>
          {models.map(m => <option key={m} value={m}>{m.replace('claude-', '')}</option>)}
        </select>
        <input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} placeholder="From" />
        <input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} placeholder="To" />
        <input type="number" value={filters.minCost} placeholder={`Min cost (${currencySymbol})`}
          onChange={e => setFilters({ ...filters, minCost: e.target.value })} style={{ width: 100 }} />
        <span className="muted">{filtered.length} sessions</span>
        <div style={{ marginLeft: 'auto' }}>
          <div className="export-buttons">
            <button onClick={handleCopyReport}>Copy Report</button>
            <button onClick={handleExportReport}>Export .md</button>
          </div>
        </div>
      </div>

      {/* Overview */}
      <div className="cache-overview">
        <div className="cache-overview-stat">
          <span className="cache-overview-num">{overview.total}</span>
          <span className="muted">Total</span>
        </div>
        <div className="cache-overview-stat">
          <span className="cache-overview-num">{overview.using5m}</span>
          <span className="muted">Using 5-min</span>
        </div>
        <div className="cache-overview-stat">
          <span className="cache-overview-num">{overview.using1h}</span>
          <span className="muted">Using 1-hour</span>
        </div>
        <div className="cache-overview-stat">
          <span className="cache-overview-num">{overview.mixed}</span>
          <span className="muted">Mixed</span>
        </div>
        <div className="cache-overview-stat">
          <span className="cache-overview-num">{overview.none}</span>
          <span className="muted">No cache</span>
        </div>
      </div>

      {/* Strategy comparison — totals */}
      <h3 style={{ margin: '20px 0 8px' }}>Strategy Comparison — All Sessions</h3>
      <StrategyTable group={totals} convertCurrency={convertCurrency} currencySymbol={currencySymbol} />

      {/* By peak context */}
      <h3 style={{ margin: '24px 0 8px' }}>By Peak Context Size <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>max input tokens in a single API call</span></h3>
      <BreakdownTable groups={byPeakContext} convertCurrency={convertCurrency} currencySymbol={currencySymbol} />

      {/* By avg gap — the money metric */}
      <h3 style={{ margin: '24px 0 8px' }}>By Avg Gap Between Messages <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>directly predicts cache expiry impact</span></h3>
      <BreakdownTable groups={byAvgGap} convertCurrency={convertCurrency} currencySymbol={currencySymbol} />

      {/* By duration */}
      <h3 style={{ margin: '24px 0 8px' }}>By Session Duration</h3>
      <BreakdownTable groups={byDuration} convertCurrency={convertCurrency} currencySymbol={currencySymbol} />

      {/* By message count */}
      <h3 style={{ margin: '24px 0 8px' }}>By Message Count</h3>
      <BreakdownTable groups={byMessageCount} convertCurrency={convertCurrency} currencySymbol={currencySymbol} />

      {/* By billing volume */}
      <h3 style={{ margin: '24px 0 8px' }}>By Billing Volume <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>cumulative tokens across all API calls</span></h3>
      <BreakdownTable groups={byBillingVolume} convertCurrency={convertCurrency} currencySymbol={currencySymbol} />
    </div>
  )
}
