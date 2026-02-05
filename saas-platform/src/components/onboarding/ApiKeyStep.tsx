'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ApiKeyStepProps {
  onNext: (data: { provider: string; apiKey: string }) => void
  onSkip: () => void
}

export function ApiKeyStep({ onNext, onSkip }: ApiKeyStepProps) {
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  async function handleValidate() {
    setValidating(true)
    setError('')

    try {
      const res = await fetch('/api/onboarding/validate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ provider, apiKey }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Invalid API key')
        return
      }

      onNext({ provider, apiKey })
    } catch {
      setError('Failed to validate API key')
    } finally {
      setValidating(false)
    }
  }

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">API Key Setup</h2>
      <p className="text-muted-foreground mb-6">
        Connect your AI provider to power your assistant
      </p>

      {/* Provider tabs */}
      <div className="flex gap-2 mb-6">
        {(['anthropic', 'openai'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={cn(
              'flex-1 py-2 px-4 rounded-lg font-medium capitalize',
              provider === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {p === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT)'}
          </button>
        ))}
      </div>

      {/* API Key input */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">API Key</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
            className="w-full p-3 pr-20 border rounded-lg focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <details className="mb-6">
        <summary className="text-sm text-primary cursor-pointer">
          How to get an API key?
        </summary>
        <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
          {provider === 'anthropic' ? (
            <p>
              Visit{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                console.anthropic.com
              </a>{' '}
              to create an API key.
            </p>
          ) : (
            <p>
              Visit{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                platform.openai.com
              </a>{' '}
              to create an API key.
            </p>
          )}
        </div>
      </details>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
        <button
          onClick={handleValidate}
          disabled={!apiKey || validating}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {validating ? 'Validating...' : 'Validate & Continue'}
        </button>
      </div>
    </div>
  )
}
