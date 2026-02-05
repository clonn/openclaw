import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { OpenClawCLI } from '@/lib/openclaw-cli'
import { updateOnboardingStep } from '@/lib/onboarding'
import { db } from '@/lib/db'
import { tenantConfigs } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const testMessageSchema = z.object({
  message: z.string().min(1).max(1000),
})

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message } = testMessageSchema.parse(body)

    const cli = new OpenClawCLI(auth.user.tenantId)

    // Initialize agent if not already done
    const initialized = await cli.isInitialized()
    if (!initialized) {
      await cli.initAgent()

      // Apply saved configs from database
      const configs = await db
        .select()
        .from(tenantConfigs)
        .where(eq(tenantConfigs.tenantId, auth.user.tenantId))

      for (const config of configs) {
        if (config.configType === 'api_key') {
          await cli.setApiKey(config.configKey, config.configValue as string)
        } else if (config.configType === 'model') {
          const modelConfig = config.configValue as { provider: string; model: string }
          await cli.setModel('default', modelConfig.provider, modelConfig.model)
        } else if (config.configType === 'channel') {
          await cli.setChannel(config.configKey, config.configValue as Record<string, string>)
          await cli.enableChannel(config.configKey)
        } else if (config.configType === 'system_prompt') {
          await cli.setSystemPrompt(config.configValue as string)
        }
      }
    }

    // Send test message
    const response = await cli.sendMessage(message)

    // Mark test step as complete
    await updateOnboardingStep(auth.user.tenantId, 'tested', true)

    return NextResponse.json({ success: true, response })
  } catch (error) {
    console.error('Test message error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    )
  }
}
