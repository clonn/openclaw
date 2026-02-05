import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { updateOnboardingStep, setCurrentStep } from '@/lib/onboarding'
import { z } from 'zod'

const stepSchema = z.object({
  step: z.enum(['welcome', 'apiKey', 'model', 'channelSelect', 'channelConfig', 'systemPrompt', 'tested']),
  value: z.boolean(),
  currentStep: z.number().optional(),
})

export async function PUT(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const { step, value, currentStep } = stepSchema.parse(body)

    const status = await updateOnboardingStep(user.tenantId, step, value)

    if (currentStep !== undefined) {
      await setCurrentStep(user.tenantId, currentStep)
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
