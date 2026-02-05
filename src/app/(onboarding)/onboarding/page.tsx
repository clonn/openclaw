"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ApiKeyStep } from "@/components/onboarding/ApiKeyStep";
import { ChannelConfigStep } from "@/components/onboarding/ChannelConfigStep";
import { ChannelSelectStep } from "@/components/onboarding/ChannelSelectStep";
import { CompleteStep } from "@/components/onboarding/CompleteStep";
import { ModelStep } from "@/components/onboarding/ModelStep";
import { Stepper } from "@/components/onboarding/Stepper";
import { SystemPromptStep } from "@/components/onboarding/SystemPromptStep";
import { TestStep } from "@/components/onboarding/TestStep";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";

const STEPS = [
  { id: 1, name: "Welcome", key: "welcome" },
  { id: 2, name: "API Key", key: "apiKey" },
  { id: 3, name: "Model", key: "model" },
  { id: 4, name: "Channel", key: "channelSelect" },
  { id: 5, name: "Config", key: "channelConfig" },
  { id: 6, name: "Prompt", key: "systemPrompt" },
  { id: 7, name: "Test", key: "tested" },
  { id: 8, name: "Done", key: "complete" },
];

interface Config {
  provider?: string;
  apiKey?: string;
  model?: string;
  channel?: string;
  channelConfig?: Record<string, string>;
  systemPrompt?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [config, setConfig] = useState<Config>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check auth and load existing status
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    fetch("/api/onboarding/status", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.status) {
          setCompletedSteps(data.status.steps);
          setCurrentStep(data.status.currentStep || 1);
          if (data.status.completed) {
            router.push("/");
          }
        }
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  async function saveStep(step: string, value: boolean, nextStep?: number) {
    const token = localStorage.getItem("token");
    await fetch("/api/onboarding/step", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ step, value, currentStep: nextStep }),
    });
    setCompletedSteps((prev) => ({ ...prev, [step]: value }));
    if (nextStep) setCurrentStep(nextStep);
  }

  async function saveConfig(type: string, key: string, value: unknown) {
    const token = localStorage.getItem("token");
    await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ configType: type, configKey: key, configValue: value }),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const steps = STEPS.map((s) => ({
    ...s,
    completed: completedSteps[s.key] || false,
  }));

  function handleStepClick(stepId: number) {
    if (stepId <= currentStep || steps[stepId - 1]?.completed) {
      setCurrentStep(stepId);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="p-4 border-b">
        <div className="max-w-2xl mx-auto">
          <Stepper steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />
        </div>
      </div>

      <div className="flex-1 p-4">
        <div className="max-w-2xl mx-auto">
          {currentStep === 1 && (
            <WelcomeStep
              onNext={() => {
                saveStep("welcome", true, 2);
              }}
            />
          )}

          {currentStep === 2 && (
            <ApiKeyStep
              onNext={async (data) => {
                setConfig((prev) => ({ ...prev, ...data }));
                await saveConfig("api_key", data.provider, data.apiKey);
                await saveStep("apiKey", true, 3);
              }}
              onSkip={() => saveStep("apiKey", false, 3)}
            />
          )}

          {currentStep === 3 && (
            <ModelStep
              provider={config.provider || "anthropic"}
              onNext={async (model) => {
                setConfig((prev) => ({ ...prev, model }));
                await saveConfig("model", "default", { provider: config.provider, model });
                await saveStep("model", true, 4);
              }}
              onSkip={() => saveStep("model", false, 4)}
            />
          )}

          {currentStep === 4 && (
            <ChannelSelectStep
              onNext={(channel) => {
                setConfig((prev) => ({ ...prev, channel }));
                saveStep("channelSelect", true, 5);
              }}
              onSkip={() => saveStep("channelSelect", false, 5)}
            />
          )}

          {currentStep === 5 && (
            <ChannelConfigStep
              channel={config.channel || "telegram"}
              onNext={async (channelConfig) => {
                setConfig((prev) => ({ ...prev, channelConfig }));
                await saveConfig("channel", config.channel || "telegram", channelConfig);
                await saveStep("channelConfig", true, 6);
              }}
              onSkip={() => saveStep("channelConfig", false, 6)}
            />
          )}

          {currentStep === 6 && (
            <SystemPromptStep
              onNext={async (prompt) => {
                setConfig((prev) => ({ ...prev, systemPrompt: prompt }));
                await saveConfig("system_prompt", "default", prompt);
                await saveStep("systemPrompt", true, 7);
              }}
              onSkip={() => saveStep("systemPrompt", false, 7)}
            />
          )}

          {currentStep === 7 && (
            <TestStep
              onNext={() => {
                saveStep("tested", true, 8);
              }}
            />
          )}

          {currentStep === 8 && <CompleteStep config={config} />}
        </div>
      </div>
    </div>
  );
}
