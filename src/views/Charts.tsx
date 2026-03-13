import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { Session } from '../lib/types'

interface Props {
  sessions: Session[]
  convertCurrency: (usd: number) => number
  currencySymbol: string
  onDayClick: (date: string) => void
}

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#f0883e', '#39d353', '#db61a2']

type HeatmapView = 'yearly' | 'monthly' | 'weekly'

interface DailySpend {
  date: string
  totalCost: number
  sessionCount: number
  topModel: string
}

interface HeatmapThresholds {
  mode: 'auto' | 'custom'
  greenToYellow: number
  yellowToRed: number
}

function loadThresholds(): HeatmapThresholds {
  try {
    const raw = localStorage.getItem('cost-tracker-heatmap-thresholds')
    if (raw) return JSON.parse(raw)
  } catch {}
  return { mode: 'auto', greenToYellow: 5, yellowToRed: 20 }
}

function saveThresholds(t: HeatmapThresholds) {
  localStorage.setItem('cost-tracker-heatmap-thresholds', JSON.stringify(t))
}

function getHeatmapColor(cost: number, median: number, thresholds: HeatmapThresholds): string {
  if (cost === 0) return '#161b22'
  if (thresholds.mode === 'custom') {
    if (cost < thresholds.greenToYellow) return '#0e4429'
    if (cost < thresholds.yellowToRed) return '#6e5a1e'
    return '#7a2020'
  }
  // Auto mode
  if (median === 0) return '#0e4429'
  if (cost <= median) return '#0e4429'
  if (cost <= median * 2) return '#6e5a1e'
  return '#7a2020'
}

function SpendingHeatmap({ sessions, convertCurrency, currencySymbol, onDayClick }: {
  sessions: Session[]
  convertCurrency: (usd: number) => number
  currencySymbol: string
  onDayClick: (date: string) => void
}) {
  const [view, setView] = useState<HeatmapView>('monthly')
  const [thresholds, setThresholds] = useState<HeatmapThresholds>(loadThresholds)
  const [showSettings, setShowSettings] = useState(false)
  const [hoveredDay, setHoveredDay] = useState<DailySpend | null>(null)

  const dailyData = useMemo(() => {
    const map = new Map<string, { cost: number; count: number; models: Map<string, number> }>()
    for (const s of sessions) {
      const day = s.startTime.slice(0, 10)
      const entry = map.get(day) || { cost: 0, count: 0, models: new Map() }
      entry.cost += s.totalCostUSD
      entry.count++
      for (const m of s.models) {
        entry.models.set(m, (entry.models.get(m) || 0) + 1)
      }
      map.set(day, entry)
    }

    const result: DailySpend[] = []
    for (const [date, data] of map) {
      const topModel = [...data.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.replace('claude-', '') || '-'
      result.push({ date, totalCost: convertCurrency(data.cost), sessionCount: data.count, topModel })
    }
    return result
  }, [sessions, convertCurrency])

  const dailyMap = useMemo(() => {
    const m = new Map<string, DailySpend>()
    for (const d of dailyData) m.set(d.date, d)
    return m
  }, [dailyData])

  const median = useMemo(() => {
    const costs = dailyData.map(d => d.totalCost).filter(c => c > 0).sort((a, b) => a - b)
    if (costs.length === 0) return 0
    const mid = Math.floor(costs.length / 2)
    return costs.length % 2 ? costs[mid] : (costs[mid - 1] + costs[mid]) / 2
  }, [dailyData])

  function renderMonthly() {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const firstDay = new Date(year, month, 1)
    const startDow = firstDay.getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: Array<{ date: string | null; day: number }> = []
    // Empty cells before first day
    for (let i = 0; i < startDow; i++) cells.push({ date: null, day: 0 })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ date, day: d })
    }

    return (
      <div>
        <div className="heatmap-dow-labels">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <span key={d}>{d}</span>)}
        </div>
        <div className="heatmap-grid monthly">
          {cells.map((cell, i) => {
            if (!cell.date) return <div key={i} className="heatmap-cell empty" />
            const data = dailyMap.get(cell.date)
            const cost = data?.totalCost || 0
            const bg = cost > 0 ? getHeatmapColor(cost, median, thresholds) : '#21262d'
            return (
              <div
                key={i}
                className="heatmap-cell monthly-cell"
                style={{ background: bg }}
                onClick={() => onDayClick(cell.date!)}
                onMouseEnter={() => setHoveredDay(data || { date: cell.date!, totalCost: 0, sessionCount: 0, topModel: '-' })}
                onMouseLeave={() => setHoveredDay(null)}
              >
                <span className="heatmap-day-num">{cell.day}</span>
                {cost > 0 && <span className="heatmap-cost">{currencySymbol}{cost.toFixed(0)}</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderWeekly() {
    const now = new Date()
    const dow = now.getDay()
    const cells: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(now.getDate() - dow + i)
      cells.push(d.toISOString().slice(0, 10))
    }

    return (
      <div className="heatmap-grid weekly">
        {cells.map(date => {
          const data = dailyMap.get(date)
          const cost = data?.totalCost || 0
          const bg = cost > 0 ? getHeatmapColor(cost, median, thresholds) : '#21262d'
          const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' })
          return (
            <div
              key={date}
              className="heatmap-cell weekly-cell"
              style={{ background: bg }}
              onClick={() => onDayClick(date)}
              onMouseEnter={() => setHoveredDay(data || { date, totalCost: 0, sessionCount: 0, topModel: '-' })}
              onMouseLeave={() => setHoveredDay(null)}
            >
              <span className="heatmap-day-name">{dayName}</span>
              <span className="heatmap-cost-large">{cost > 0 ? `${currencySymbol}${cost.toFixed(2)}` : '-'}</span>
              {data && <span className="heatmap-detail">{data.sessionCount} session{data.sessionCount !== 1 ? 's' : ''}</span>}
            </div>
          )
        })}
      </div>
    )
  }

  function renderYearly() {
    const now = new Date()
    const year = now.getFullYear()
    // Build 52 weeks × 7 days grid
    const jan1 = new Date(year, 0, 1)
    const startOffset = jan1.getDay()
    const cells: Array<{ date: string; week: number; dow: number }> = []

    for (let w = 0; w < 53; w++) {
      for (let d = 0; d < 7; d++) {
        const dayIndex = w * 7 + d - startOffset
        const dt = new Date(year, 0, 1 + dayIndex)
        if (dt.getFullYear() !== year) continue
        cells.push({ date: dt.toISOString().slice(0, 10), week: w, dow: d })
      }
    }

    return (
      <div className="heatmap-yearly-container">
        <div className="heatmap-grid yearly">
          {cells.map(cell => {
            const data = dailyMap.get(cell.date)
            const cost = data?.totalCost || 0
            const bg = cost > 0 ? getHeatmapColor(cost, median, thresholds) : '#21262d'
            return (
              <div
                key={cell.date}
                className="heatmap-cell yearly-cell"
                style={{
                  background: bg,
                  gridColumn: cell.week + 1,
                  gridRow: cell.dow + 1,
                }}
                onClick={() => onDayClick(cell.date)}
                onMouseEnter={() => setHoveredDay(data || { date: cell.date, totalCost: 0, sessionCount: 0, topModel: '-' })}
                onMouseLeave={() => setHoveredDay(null)}
              />
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>Spending Heatmap</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="tab-buttons" style={{ fontSize: 12 }}>
            {(['weekly', 'monthly', 'yearly'] as HeatmapView[]).map(v => (
              <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v}</button>
            ))}
          </div>
          <button
            className="currency-toggle"
            style={{ fontSize: 11, padding: '4px 8px' }}
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="heatmap-settings">
          <label>
            <input type="radio" checked={thresholds.mode === 'auto'} onChange={() => { const t = { ...thresholds, mode: 'auto' as const }; setThresholds(t); saveThresholds(t) }} /> Auto (median-based)
          </label>
          <label>
            <input type="radio" checked={thresholds.mode === 'custom'} onChange={() => { const t = { ...thresholds, mode: 'custom' as const }; setThresholds(t); saveThresholds(t) }} /> Custom
          </label>
          {thresholds.mode === 'custom' && (
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <label>Green → Yellow: {currencySymbol}<input type="number" value={thresholds.greenToYellow} onChange={e => { const t = { ...thresholds, greenToYellow: +e.target.value }; setThresholds(t); saveThresholds(t) }} style={{ width: 60 }} /></label>
              <label>Yellow → Red: {currencySymbol}<input type="number" value={thresholds.yellowToRed} onChange={e => { const t = { ...thresholds, yellowToRed: +e.target.value }; setThresholds(t); saveThresholds(t) }} style={{ width: 60 }} /></label>
              <button onClick={() => { const t = { mode: 'auto' as const, greenToYellow: 5, yellowToRed: 20 }; setThresholds(t); saveThresholds(t) }}>Reset to auto</button>
            </div>
          )}
        </div>
      )}

      {/* Tooltip */}
      {hoveredDay && (
        <div className="heatmap-tooltip">
          <strong>{hoveredDay.date}</strong> · {currencySymbol}{hoveredDay.totalCost.toFixed(2)} · {hoveredDay.sessionCount} sessions · {hoveredDay.topModel}
        </div>
      )}

      {view === 'monthly' && renderMonthly()}
      {view === 'weekly' && renderWeekly()}
      {view === 'yearly' && renderYearly()}
    </div>
  )
}

export function Charts({ sessions, convertCurrency, currencySymbol, onDayClick }: Props) {
  const dailyCosts = useMemo(() => {
    const map = new Map<string, number>()
    sessions.forEach(s => {
      const day = s.startTime.slice(0, 10)
      map.set(day, (map.get(day) ?? 0) + s.totalCostUSD)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, cost]) => ({ date, cost: convertCurrency(cost) }))
  }, [sessions, convertCurrency])

  const modelCosts = useMemo(() => {
    const map = new Map<string, number>()
    sessions.forEach(s => {
      s.messages.forEach(m => {
        if (m.role === 'assistant' && m.model) {
          const model = m.model.replace('claude-', '')
          map.set(model, (map.get(model) ?? 0) + m.costUSD)
        }
      })
      s.subAgents.forEach(sa => {
        sa.messages.forEach(m => {
          if (m.role === 'assistant' && m.model) {
            const model = m.model.replace('claude-', '')
            map.set(model, (map.get(model) ?? 0) + m.costUSD)
          }
        })
      })
    })
    return Array.from(map.entries())
      .map(([name, cost]) => ({ name, value: convertCurrency(cost) }))
      .sort((a, b) => b.value - a.value)
  }, [sessions, convertCurrency])

  const topSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.totalCostUSD - a.totalCostUSD)
      .slice(0, 10)
      .map(s => ({
        name: `${s.startTime.slice(5, 10)} ${s.cwd.split('/').pop()}`,
        cost: convertCurrency(s.totalCostUSD),
      }))
  }, [sessions, convertCurrency])

  return (
    <div style={{ display: 'grid', gap: 32 }}>
      <SpendingHeatmap
        sessions={sessions}
        convertCurrency={convertCurrency}
        currencySymbol={currencySymbol}
        onDayClick={onDayClick}
      />

      <div>
        <h3>Daily Cost</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={dailyCosts}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey="date" stroke="#7d8590" fontSize={12} />
            <YAxis stroke="#7d8590" fontSize={12} tickFormatter={v => `${currencySymbol}${v.toFixed(0)}`} />
            <Tooltip
              contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }}
              formatter={(value: number) => [`${currencySymbol}${value.toFixed(2)}`, 'Cost']}
            />
            <Bar dataKey="cost" fill="#58a6ff" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <h3>Cost by Model</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={modelCosts}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${currencySymbol}${value.toFixed(2)}`}
              >
                {modelCosts.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }}
                formatter={(value: number) => [`${currencySymbol}${value.toFixed(2)}`]}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h3>Top 10 Most Expensive Sessions</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topSessions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis type="number" stroke="#7d8590" fontSize={12} tickFormatter={v => `${currencySymbol}${v.toFixed(0)}`} />
              <YAxis type="category" dataKey="name" stroke="#7d8590" fontSize={11} width={150} />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', color: '#e6edf3' }}
                formatter={(value: number) => [`${currencySymbol}${value.toFixed(2)}`, 'Cost']}
              />
              <Bar dataKey="cost" fill="#3fb950" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
