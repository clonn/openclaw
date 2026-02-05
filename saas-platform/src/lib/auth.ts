import { db } from './db'
import { users, tenants, subscriptions, plans } from './db/schema'
import { eq } from 'drizzle-orm'
import { hashPassword, verifyPassword, signToken, TokenPayload } from './auth-utils'
import crypto from 'crypto'

export interface AuthResult {
  success: boolean
  user?: TokenPayload
  token?: string
  error?: string
}

export async function register(email: string, password: string): Promise<AuthResult> {
  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return { success: false, error: 'Email already registered' }
  }

  const passwordHash = await hashPassword(password)
  const userId = crypto.randomUUID()
  const tenantId = `tenant-${userId.slice(0, 8)}`

  try {
    // Create user
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
    })

    // Create tenant with default onboarding status
    const [tenant] = await db.insert(tenants).values({
      userId,
      agentId: tenantId,
      displayName: email.split('@')[0],
      onboardingStatus: {
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
      },
    }).returning()

    // Get free plan
    const [freePlan] = await db.select().from(plans).where(eq(plans.name, 'free')).limit(1)

    if (freePlan) {
      // Create subscription
      await db.insert(subscriptions).values({
        tenantId: tenant.id,
        planId: freePlan.id,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
    }

    const tokenPayload: TokenPayload = { userId, email, tenantId }
    const token = await signToken(tokenPayload)

    return { success: true, user: tokenPayload, token }
  } catch (error) {
    console.error('Registration error:', error)
    return { success: false, error: 'Registration failed' }
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      agentId: tenants.agentId,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.userId, users.id))
    .where(eq(users.email, email))
    .limit(1)

  if (result.length === 0) {
    return { success: false, error: 'Invalid email or password' }
  }

  const user = result[0]
  const valid = await verifyPassword(password, user.passwordHash)

  if (!valid) {
    return { success: false, error: 'Invalid email or password' }
  }

  const tokenPayload: TokenPayload = {
    userId: user.id,
    email: user.email,
    tenantId: user.agentId,
  }
  const token = await signToken(tokenPayload)

  return { success: true, user: tokenPayload, token }
}
