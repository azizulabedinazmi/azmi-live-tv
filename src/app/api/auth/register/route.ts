import { hashPassword, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(1).max(100),
  role: z.enum([Role.ADMIN, Role.USER]).default(Role.USER),
});

export async function POST(request: import("next/server").NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.session) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message ?? "Invalid request payload";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const username = parsed.data.username;

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
    },
    select: {
      id: true,
      username: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
