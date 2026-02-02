import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { db } from '@/lib/db'
import { tenantConfigs } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { OpenClawCLI } from '@/lib/openclaw-cli'
import { z } from 'zod'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    let query = db
      .select()
      .from(tenantConfigs)
      .where(eq(tenantConfigs.tenantId, user.tenantId))

    if (type) {
      query = db
        .select()
        .from(tenantConfigs)
        .where(and(
          eq(tenantConfigs.tenantId, user.tenantId),
          eq(tenantConfigs.configType, type)
        ))
    }

    const configs = await query

    const result: Record<string, any> = {}
    for (const config of configs) {
      if (!result[config.configType]) {
        result[config.configType] = {}
      }
      result[config.configType][config.configKey] = {
        ...config.configValue as object,
        enabled: config.enabled,
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

const updateSchema = z.object({
  type: z.enum(['channel', 'model', 'tool', 'agent']),
  key: z.string(),
  value: z.record(z.any()),
})

export async function PUT(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const { type, key, value } = updateSchema.parse(body)

    const cli = new OpenClawCLI(user.tenantId)

    switch (type) {
      case 'channel':
        if (value.enabled !== undefined) {
          if (value.enabled) {
            await cli.enableChannel(key)
          } else {
            await cli.disableChannel(key)
          }
        }
        const { enabled, ...channelConfig } = value
        if (Object.keys(channelConfig).length > 0) {
          await cli.setChannel(key, channelConfig)
        }
        break

      case 'model':
        if (value.provider && value.model) {
          await cli.setModel(key, value.provider, value.model)
        }
        if (value.apiKey) {
          await cli.setApiKey(value.provider || key, value.apiKey)
        }
        break

      case 'tool':
        if (value.enabled !== undefined) {
          await cli.setToolEnabled(key, value.enabled)
        }
        break

      case 'agent':
        if (value.systemPrompt) {
          await cli.setSystemPrompt(value.systemPrompt)
        }
        break
    }

    await db
      .insert(tenantConfigs)
      .values({
        tenantId: user.tenantId,
        configType: type,
        configKey: key,
        configValue: value,
        enabled: value.enabled ?? true,
      })
      .onConflictDoUpdate({
        target: [tenantConfigs.tenantId, tenantConfigs.configType, tenantConfigs.configKey],
        set: {
          configValue: value,
          enabled: value.enabled ?? true,
          updatedAt: new Date(),
        },
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('Config update error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
