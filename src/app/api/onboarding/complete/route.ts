import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { requireAuth } from "@/lib/middleware";
import { getOnboardingStatus } from "@/lib/onboarding";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (!auth.success) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getOnboardingStatus(auth.user.tenantId);

  // Check required steps
  if (!status.steps.apiKey || !status.steps.channelConfig || !status.steps.tested) {
    return NextResponse.json(
      { success: false, error: "Please complete all required steps", status },
      { status: 400 },
    );
  }

  // Mark as complete
  await db
    .update(tenants)
    .set({
      onboardingStatus: { ...status, completed: true },
    })
    .where(eq(tenants.agentId, auth.user.tenantId));

  return NextResponse.json({ success: true });
}
