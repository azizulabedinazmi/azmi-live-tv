import { requireAdmin } from "@/lib/auth";
import { syncChannels } from "@/lib/github-sync";
import { NextResponse } from "next/server";
import { z } from "zod";

const syncSchema = z.object({
  force: z.boolean().optional(),
});

export async function POST(request: import("next/server").NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.session) {
    return auth.response;
  }

  const json = await request.json().catch(() => ({}));
  const parsed = syncSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const result = await syncChannels(auth.session.userId, parsed.data.force ?? false);

  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
