"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface CompleteStepProps {
  config: {
    provider?: string;
    model?: string;
    channel?: string;
  };
}

export function CompleteStep({ config }: CompleteStepProps) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);

  async function handleComplete() {
    setCompleting(true);

    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      router.push("/");
    } catch {
      setCompleting(false);
    }
  }

  return (
    <div className="py-8 max-w-md mx-auto text-center">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
      <p className="text-muted-foreground mb-8">Your OpenClaw assistant is ready to use</p>

      <div className="bg-muted rounded-lg p-4 mb-8 text-left">
        <h3 className="font-medium mb-3">Setup Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI Provider</span>
            <span className="capitalize">{config.provider || "Not set"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Model</span>
            <span>{config.model || "Default"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Channel</span>
            <span className="capitalize">{config.channel || "Not set"}</span>
          </div>
        </div>
      </div>

      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
      >
        {completing ? "Loading..." : "Go to Dashboard"}
      </button>
    </div>
  );
}
