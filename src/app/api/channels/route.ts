import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  q: z.string().optional(),
  group: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  favoritesOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(request: import("next/server").NextRequest) {
  const auth = await requireSession(request);
  if (!auth.session) {
    return auth.response;
  }

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const { q, group, limit = 250, favoritesOnly } = parsed.data;
  const searchTerm = q?.trim();

  const channels = await prisma.channel.findMany({
    where: {
      isActive: true,
      ...(searchTerm
        ? {
            OR: [
              { name: { contains: searchTerm, mode: "insensitive" } },
              { groupName: { contains: searchTerm, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(group ? { groupName: group } : {}),
      ...(favoritesOnly === "true"
        ? { favorites: { some: { userId: auth.session.userId } } }
        : {}),
    },
    orderBy: [{ groupName: "asc" }, { name: "asc" }],
    take: limit,
    select: {
      id: true,
      name: true,
      streamUrl: true,
      logoUrl: true,
      groupName: true,
      favorites: {
        where: { userId: auth.session.userId },
        select: { id: true },
      },
    },
  });

  const groups = await prisma.channel.findMany({
    where: { isActive: true, groupName: { not: null } },
    select: { groupName: true },
    distinct: ["groupName"],
    orderBy: { groupName: "asc" },
  });

  return NextResponse.json({
    channels: channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      streamUrl: channel.streamUrl,
      logoUrl: channel.logoUrl,
      groupName: channel.groupName,
      isFavorite: channel.favorites.length > 0,
    })),
    groups: groups.map((groupItem) => groupItem.groupName).filter(Boolean),
  });
}
