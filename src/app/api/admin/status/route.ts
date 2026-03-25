import { requireAdmin } from "@/lib/auth";
import { getSyncDashboardStatus } from "@/lib/github-sync";
import { NextResponse } from "next/server";

export async function GET(request: import("next/server").NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.session) {
    return auth.response;
  }

  const status = await getSyncDashboardStatus();
  return NextResponse.json(status);
}
