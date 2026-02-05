import { db } from './db'
import { tenants } from './db/schema'
import { eq } from 'drizzle-orm'

export interface OnboardingStatus {
  completed: boolean
  currentStep: number
  steps: {
    welcome: boolean
    apiKey: boolean
    model: boolean
    channelSelect: boolean
    channelConfig: boolean
    systemPrompt: boolean
    tested: boolean
  }
}

export const DEFAULT_ONBOARDING_STATUS: OnboardingStatus = {
  completed: false,
  currentStep: 1,
  steps: {
    welcome: false,
    apiKey: false,
    model: false,
    channelSelect: false,
    channelConfig: false,
    systemPrompt: false,
    tested: false,
  },
}

export async function getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
  const [tenant] = await db
    .select({ onboardingStatus: tenants.onboardingStatus })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  return (tenant?.onboardingStatus as OnboardingStatus) || DEFAULT_ONBOARDING_STATUS
}

export async function updateOnboardingStep(
  tenantId: string,
  step: keyof OnboardingStatus['steps'],
  value: boolean
): Promise<OnboardingStatus> {
  const current = await getOnboardingStatus(tenantId)

  const updated: OnboardingStatus = {
    ...current,
    steps: {
      ...current.steps,
      [step]: value,
    },
  }

  // Check if all required steps are complete
  const requiredComplete = updated.steps.apiKey && updated.steps.channelConfig && updated.steps.tested
  updated.completed = requiredComplete

  await db
    .update(tenants)
    .set({ onboardingStatus: updated })
    .where(eq(tenants.id, tenantId))

  return updated
}

export async function setCurrentStep(tenantId: string, step: number): Promise<void> {
  const current = await getOnboardingStatus(tenantId)
  await db
    .update(tenants)
    .set({ onboardingStatus: { ...current, currentStep: step } })
    .where(eq(tenants.id, tenantId))
}
