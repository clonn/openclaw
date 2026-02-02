'use client'

import { useState, useEffect } from 'react'
import { MessageSquare } from 'lucide-react'

interface Session {
  id: string
  sessionId: string
  channel: string | null
  messageCount: number
  lastMessageAt: string | null
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSessions()
  }, [])

  async function fetchSessions() {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/sessions', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setSessions(data.sessions || [])
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sessions</h1>

      {sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No sessions yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <a
              key={session.id}
              href={`/sessions/${session.sessionId}`}
              className="block p-4 bg-card rounded-lg border hover:border-primary transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{session.sessionId}</div>
                  <div className="text-sm text-muted-foreground">
                    {session.channel || 'Unknown channel'} • {session.messageCount} messages
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {session.lastMessageAt
                    ? new Date(session.lastMessageAt).toLocaleDateString()
                    : 'Never'}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
