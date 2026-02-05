'use client'

interface WelcomeStepProps {
  onNext: () => void
}

const features = [
  { icon: '💬', title: 'Multi-Channel', desc: 'Connect Telegram, Discord, Slack, WhatsApp' },
  { icon: '🤖', title: 'AI Assistant', desc: 'Powered by Claude or GPT-4' },
  { icon: '⚡', title: 'Always On', desc: 'Your assistant runs 24/7' },
  { icon: '🔒', title: 'Private', desc: 'Your data stays secure' },
]

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center py-8">
      <h1 className="text-3xl font-bold mb-4">Welcome to OpenClaw</h1>
      <p className="text-muted-foreground mb-8">
        Your personal AI assistant across all messaging platforms
      </p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        {features.map((feature) => (
          <div key={feature.title} className="p-4 bg-muted rounded-lg">
            <div className="text-3xl mb-2">{feature.icon}</div>
            <h3 className="font-medium">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">{feature.desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
      >
        Start Setup
      </button>
    </div>
  )
}
