import type { Session } from './types'

export interface Filters {
  model: string
  dateFrom: string
  dateTo: string
  minCost: string
}

export function filterSessions(
  sessions: Session[],
  filters: Filters,
  convertCurrency: (usd: number) => number,
): Session[] {
  return sessions.filter(s => {
    if (filters.model && !s.models.includes(filters.model)) return false
    if (filters.dateFrom && s.startTime < filters.dateFrom) return false
    if (filters.dateTo && s.startTime > filters.dateTo + 'T23:59:59') return false
    if (filters.minCost) {
      const min = parseFloat(filters.minCost)
      if (!isNaN(min) && convertCurrency(s.totalCostUSD) < min) return false
    }
    return true
  })
}
