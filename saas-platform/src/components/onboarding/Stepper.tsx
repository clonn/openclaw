'use client'

import { cn } from '@/lib/utils'

interface Step {
  id: number
  name: string
  completed: boolean
}

interface StepperProps {
  steps: Step[]
  currentStep: number
  onStepClick?: (step: number) => void
}

export function Stepper({ steps, currentStep, onStepClick }: StepperProps) {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center flex-1">
            {/* Step circle */}
            <button
              onClick={() => onStepClick?.(step.id)}
              disabled={!step.completed && step.id > currentStep}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step.id === currentStep && 'bg-primary text-primary-foreground',
                step.completed && step.id !== currentStep && 'bg-green-500 text-white',
                !step.completed && step.id !== currentStep && 'bg-muted text-muted-foreground',
                step.completed && 'cursor-pointer hover:opacity-80',
              )}
            >
              {step.completed && step.id !== currentStep ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.id
              )}
            </button>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  step.completed ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step labels */}
      <div className="flex justify-between mt-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'text-xs text-center flex-1',
              step.id === currentStep ? 'text-primary font-medium' : 'text-muted-foreground'
            )}
          >
            {step.name}
          </div>
        ))}
      </div>
    </div>
  )
}
