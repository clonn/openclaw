import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { getOnboardingStatus } from '@/lib/onboarding'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const status = await getOnboardingStatus(user.tenantId)
    return NextResponse.json({ success: true, status })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
