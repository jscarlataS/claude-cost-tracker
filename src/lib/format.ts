export function formatDuration(ms: number): string {
  if (ms <= 0) return '-'
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function formatCost(amount: number, symbol: string): string {
  if (amount === 0) return '-'
  return `${symbol}${amount.toFixed(4)}`
}

export function formatCostShort(amount: number, symbol: string): string {
  return `${symbol}${amount.toFixed(2)}`
}

export function shortenPath(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, '~')
}
