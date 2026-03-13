import { useState, useEffect } from 'react'
import type { ParsedSession, Session, ApiResponse } from '../lib/types'
import { calculateSessionCosts } from '../lib/pricing'

interface UseSessionsResult {
  sessions: Session[]
  loading: boolean
  error: string | null
}

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/sessions')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ApiResponse>
      })
      .then(data => {
        const enriched = data.sessions
          .map((s: ParsedSession) => calculateSessionCosts(s))
          .sort((a: Session, b: Session) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        setSessions(enriched)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  return { sessions, loading, error }
}
