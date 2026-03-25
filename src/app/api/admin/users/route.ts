import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["ban", "unban"]),
});

const deleteSchema = z.object({
  userId: z.string().min(1),
});

export async function GET(request: import("next/server").NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.session) {
    return auth.response;
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      role: true,
      isBanned: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ users });
}

export async function PATCH(request: import("next/server").NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.session) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (parsed.data.userId === auth.session.userId && parsed.data.action === "ban") {
    return NextResponse.json({ error: "You cannot ban your own account." }, { status: 400 });
  }

  const updated = await prisma.user.updateMany({
    where: { id: parsed.data.userId },
    data: { isBanned: parsed.data.action === "ban" },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: import("next/server").NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.session) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (parsed.data.userId === auth.session.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const deleted = await prisma.user.deleteMany({
    where: { id: parsed.data.userId },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
