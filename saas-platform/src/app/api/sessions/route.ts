import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { db } from '@/lib/db'
import { sessions, messages } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (sessionId) {
      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(messages.createdAt)

      return NextResponse.json({ messages: msgs })
    }

    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tenantId, user.tenantId))
      .orderBy(desc(sessions.lastMessageAt))
      .limit(50)

    return NextResponse.json({ sessions: sessionList })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
