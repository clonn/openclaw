'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  MessageSquare,
  Settings,
  CreditCard,
  BarChart,
  Plug,
  Bot,
  Wrench
} from 'lucide-react'

const navigation = [
  { name: 'Overview', href: '/', icon: Home },
  { name: 'Channels', href: '/channels', icon: Plug },
  { name: 'Models', href: '/models', icon: Bot },
  { name: 'Tools', href: '/tools', icon: Wrench },
  { name: 'Agent', href: '/agent', icon: Settings },
  { name: 'Sessions', href: '/sessions', icon: MessageSquare },
  { name: 'Analytics', href: '/analytics', icon: BarChart },
  { name: 'Billing', href: '/billing', icon: CreditCard },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-card border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">OpenClaw</h1>
        </div>
        <nav className="p-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
