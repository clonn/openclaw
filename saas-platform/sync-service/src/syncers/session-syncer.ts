import { db } from '../../../src/lib/db'
import { sessions, messages } from '../../../src/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import fs from 'fs/promises'
import readline from 'readline'
import { createReadStream } from 'fs'

export async function syncSessionMessages(tenantId: string, filePath: string): Promise<void> {
  const filename = filePath.split('/').pop()!
  const sessionId = filename.replace('.jsonl', '')

  const existingSessions = await db
    .select()
    .from(sessions)
    .where(and(
      eq(sessions.tenantId, tenantId),
      eq(sessions.sessionId, sessionId)
    ))
    .limit(1)

  if (existingSessions.length === 0) {
    await db.insert(sessions).values({
      tenantId,
      sessionId,
      startedAt: new Date(),
    })
  }

  const rl = readline.createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity
  })

  let messageCount = 0
  let lastMessageAt: Date | null = null

  for await (const line of rl) {
    if (!line.trim()) continue

    try {
      const msg = JSON.parse(line)
      const createdAt = new Date(msg.timestamp || Date.now())

      await db.insert(messages).values({
        tenantId,
        sessionId,
        role: msg.role || 'user',
        content: msg.content,
        tokenCount: msg.tokenCount,
        createdAt,
        metadata: msg.metadata,
      }).onConflictDoNothing()

      messageCount++
      lastMessageAt = createdAt
    } catch (e) {
      console.error('Error parsing message line:', e)
    }
  }

  if (lastMessageAt) {
    await db
      .update(sessions)
      .set({
        messageCount,
        lastMessageAt,
      })
      .where(and(
        eq(sessions.tenantId, tenantId),
        eq(sessions.sessionId, sessionId)
      ))
  }
}

export async function syncSessionIndex(tenantId: string, filePath: string): Promise<void> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const sessionsData = JSON.parse(content)

    for (const [sessionId, metadata] of Object.entries(sessionsData)) {
      const meta = metadata as Record<string, any>

      await db
        .insert(sessions)
        .values({
          tenantId,
          sessionId,
          channel: meta.channel,
          startedAt: meta.startedAt ? new Date(meta.startedAt) : null,
          lastMessageAt: meta.updatedAt ? new Date(meta.updatedAt) : null,
          metadata: meta,
        })
        .onConflictDoUpdate({
          target: [sessions.tenantId, sessions.sessionId],
          set: {
            channel: meta.channel,
            lastMessageAt: meta.updatedAt ? new Date(meta.updatedAt) : null,
            metadata: meta,
          },
        })
    }
  } catch (e) {
    console.error('Error syncing session index:', e)
  }
}
