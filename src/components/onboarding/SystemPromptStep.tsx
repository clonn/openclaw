"use client";

import { useState } from "react";

interface SystemPromptStepProps {
  onNext: (prompt: string) => void;
  onSkip: () => void;
}

const DEFAULT_PROMPT = `You are a friendly and helpful AI assistant. You provide clear, concise, and accurate responses. You're conversational but professional, and always try to be helpful.`;

export function SystemPromptStep({ onNext, onSkip }: SystemPromptStepProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  return (
    <div className="py-8 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-2">System Prompt</h2>
      <p className="text-muted-foreground mb-6">
        Customize your assistant's personality and behavior
      </p>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary resize-none"
          placeholder="Describe how your assistant should behave..."
        />
      </div>

      <button
        onClick={() => setPrompt(DEFAULT_PROMPT)}
        className="text-sm text-primary hover:underline mb-6 block"
      >
        Reset to default
      </button>

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-3 border rounded-lg text-muted-foreground hover:bg-muted"
        >
          Skip (use default)
        </button>
        <button
          onClick={() => onNext(prompt)}
          className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
