import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const favoriteSchema = z.object({
  channelId: z.coerce.number().int().positive(),
});

export async function GET(request: import("next/server").NextRequest) {
  const auth = await requireSession(request);
  if (!auth.session) {
    return auth.response;
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: auth.session.userId },
    include: {
      channel: {
        select: {
          id: true,
          name: true,
          streamUrl: true,
          logoUrl: true,
          groupName: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    favorites: favorites.map((favorite) => favorite.channel),
  });
}

export async function POST(request: import("next/server").NextRequest) {
  const auth = await requireSession(request);
  if (!auth.session) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = favoriteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  await prisma.favorite.upsert({
    where: {
      userId_channelId: {
        userId: auth.session.userId,
        channelId: parsed.data.channelId,
      },
    },
    create: {
      userId: auth.session.userId,
      channelId: parsed.data.channelId,
    },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: import("next/server").NextRequest) {
  const auth = await requireSession(request);
  if (!auth.session) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = favoriteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  await prisma.favorite.deleteMany({
    where: {
      userId: auth.session.userId,
      channelId: parsed.data.channelId,
    },
  });

  return NextResponse.json({ ok: true });
}
