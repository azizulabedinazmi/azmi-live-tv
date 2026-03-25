import { requireSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: import("next/server").NextRequest) {
  const auth = await requireSession(request);
  if (!auth.session) {
    return auth.response;
  }

  return NextResponse.json({ user: auth.session });
}
