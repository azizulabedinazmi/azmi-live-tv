import { ensureBootstrapAdmin, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE, getSessionMaxAge, SESSION_COOKIE, signSessionToken } from "@/lib/session";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(1).max(100),
});

function getDeviceId(request: NextRequest) {
  const existing = request.cookies.get(DEVICE_COOKIE)?.value;
  if (existing && existing.length >= 10) {
    return existing;
  }

  return crypto.randomUUID();
}

export async function POST(request: NextRequest) {
  try {
    await ensureBootstrapAdmin();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
      return NextResponse.json(
        {
          error:
            "Database tables are missing. Run: npx prisma db push --skip-generate, then restart the dev server.",
        },
        { status: 500 },
      );
    }

    throw error;
  }

  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const username = parsed.data.username.trim();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  if (user.isBanned) {
    return NextResponse.json({ error: "Your account has been banned." }, { status: 403 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const deviceId = getDeviceId(request);

  const existingDeviceSession = await prisma.userDeviceSession.findUnique({
    where: {
      userId_deviceId: {
        userId: user.id,
        deviceId,
      },
    },
    select: {
      revokedAt: true,
    },
  });

  if (!existingDeviceSession || existingDeviceSession.revokedAt) {
    const activeDeviceCount = await prisma.userDeviceSession.count({
      where: {
        userId: user.id,
        revokedAt: null,
      },
    });

    if (activeDeviceCount >= user.maxDevices) {
      return NextResponse.json(
        {
          error: `Device limit reached. This account allows ${user.maxDevices} active device(s).`,
        },
        { status: 403 },
      );
    }
  }

  await prisma.userDeviceSession.upsert({
    where: {
      userId_deviceId: {
        userId: user.id,
        deviceId,
      },
    },
    update: {
      revokedAt: null,
      lastSeenAt: new Date(),
    },
    create: {
      userId: user.id,
      deviceId,
      lastSeenAt: new Date(),
    },
  });

  const token = await signSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    deviceId,
  });

  const response = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
    },
  });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getSessionMaxAge(),
  });

  response.cookies.set({
    name: DEVICE_COOKIE,
    value: deviceId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
