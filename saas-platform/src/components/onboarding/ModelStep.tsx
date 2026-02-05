'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ModelStepProps {
  provider: string
  onNext: (model: string) => void
  onSkip: () => void
}

const MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Best balance of speed and intelligence', recommended: true },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', desc: 'Most capable, slower responses' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', desc: 'Fastest, good for simple tasks' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', desc: 'Latest multimodal model', recommended: true },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', desc: 'Powerful with vision capabilities' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', desc: 'Fast and cost-effective' },
  ],
}

export function ModelStep({ provider, onNext, onSkip }: ModelStepProps) {
  const models = MODELS[provider as keyof typeof MODELS] || MODELS.anthropic
  const [selected, setSelected] = useState(models.find((m) => m.recommended)?.id || models[0].id)

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">Choose Your Model</h2>
      <p className="text-muted-foreground mb-6">
        Select the AI model for your assistant
      </p>

      <div className="space-y-3 mb-6">
        {models.map((model) => (
          <button
            key={model.id}
            onClick={() => setSelected(model.id)}
            className={cn(
              'w-full p-4 rounded-lg border text-left transition-colors',
              selected === model.id
                ? 'border-primary bg-primary/5'
                : 'border-muted hover:border-primary/50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{model.name}</span>
              {model.recommended && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                  Recommended
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{model.desc}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={() => onNext(selected)}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
