import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { z } from 'zod'

const validateChannelSchema = z.object({
  channel: z.enum(['telegram', 'discord', 'slack', 'whatsapp']),
  config: z.record(z.string()),
})

async function validateTelegram(token: string): Promise<{ valid: boolean; error?: string; botInfo?: unknown }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    const data = await res.json()
    if (data.ok) {
      return { valid: true, botInfo: data.result }
    }
    return { valid: false, error: data.description || 'Invalid token' }
  } catch {
    return { valid: false, error: 'Failed to connect to Telegram' }
  }
}

async function validateDiscord(token: string): Promise<{ valid: boolean; error?: string; botInfo?: unknown }> {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      return { valid: true, botInfo: data }
    }
    return { valid: false, error: 'Invalid token' }
  } catch {
    return { valid: false, error: 'Failed to connect to Discord' }
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { channel, config } = validateChannelSchema.parse(body)

    let result: { valid: boolean; error?: string; botInfo?: unknown }

    switch (channel) {
      case 'telegram':
        result = await validateTelegram(config.token || '')
        break
      case 'discord':
        result = await validateDiscord(config.token || '')
        break
      case 'slack':
      case 'whatsapp':
        // Simplified validation - just check token format
        result = { valid: (config.token?.length || 0) > 10 }
        break
      default:
        result = { valid: false, error: 'Unknown channel' }
    }

    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, channel, botInfo: result.botInfo })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
