import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { z } from 'zod'

const validateKeySchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  apiKey: z.string().min(10),
})

async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    })
    // 200 = valid, 401 = invalid key, other errors might be rate limit etc.
    return res.status === 200 || res.status === 400 // 400 means key is valid but request issue
  } catch {
    return false
  }
}

async function validateOpenAIKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    return res.status === 200
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { provider, apiKey } = validateKeySchema.parse(body)

    const isValid = provider === 'anthropic'
      ? await validateAnthropicKey(apiKey)
      : await validateOpenAIKey(apiKey)

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 400 })
    }

    return NextResponse.json({ success: true, provider })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
