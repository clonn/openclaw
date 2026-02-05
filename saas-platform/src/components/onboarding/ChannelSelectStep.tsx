'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ChannelSelectStepProps {
  onNext: (channel: string) => void
  onSkip: () => void
}

const CHANNELS = [
  { id: 'telegram', name: 'Telegram', icon: '✈️', desc: 'Bots via @BotFather' },
  { id: 'discord', name: 'Discord', icon: '🎮', desc: 'Server and DM bots' },
  { id: 'slack', name: 'Slack', icon: '💼', desc: 'Workspace integration' },
  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', desc: 'Business API' },
]

export function ChannelSelectStep({ onNext, onSkip }: ChannelSelectStepProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Choose a Channel</h2>
      <p className="text-muted-foreground mb-6">
        Where do you want your assistant to respond?
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            onClick={() => setSelected(channel.id)}
            className={cn(
              'p-4 rounded-lg border text-center transition-colors',
              selected === channel.id
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/50'
            )}
          >
            <div className="text-3xl mb-2">{channel.icon}</div>
            <div className="font-medium">{channel.name}</div>
            <div className="text-xs text-muted-foreground">{channel.desc}</div>
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground text-center mb-6">
        You can add more channels later in the Dashboard
      </p>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
