'use client'

import { useRouter } from 'next/navigation'

interface DashboardLockProps {
  show: boolean
}

export function DashboardLock({ show }: DashboardLockProps) {
  const router = useRouter()

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-card border rounded-lg shadow-lg p-8 max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold mb-2">Setup Incomplete</h2>
        <p className="text-muted-foreground mb-6">
          Complete the setup to unlock all OpenClaw features
        </p>
        <button
          onClick={() => router.push('/onboarding')}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
        >
          Continue Setup
        </button>
      </div>
    </div>
  )
}
