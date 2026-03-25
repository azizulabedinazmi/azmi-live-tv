import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, type SessionPayload, verifySessionToken } from "@/lib/session";
import { Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function ensureBootstrapAdmin() {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!username || !password) {
    return;
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return;
  }

  await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      role: Role.ADMIN,
    },
  });
}

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function requireSession(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      username: true,
      role: true,
      isBanned: true,
    },
  });

  if (!user) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (user.isBanned) {
    return {
      session: null,
      response: NextResponse.json({ error: "Your account has been banned." }, { status: 403 }),
    };
  }

  const deviceSession = await prisma.userDeviceSession.findUnique({
    where: {
      userId_deviceId: {
        userId: user.id,
        deviceId: session.deviceId,
      },
    },
    select: {
      revokedAt: true,
    },
  });

  if (!deviceSession || deviceSession.revokedAt) {
    return {
      session: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  await prisma.userDeviceSession.update({
    where: {
      userId_deviceId: {
        userId: user.id,
        deviceId: session.deviceId,
      },
    },
    data: { lastSeenAt: new Date() },
  });

  return {
    session: {
      userId: user.id,
      username: user.username,
      role: user.role,
      deviceId: session.deviceId,
    },
    response: null,
  };
}

export async function requireAdmin(request: NextRequest) {
  const auth = await requireSession(request);
  if (!auth.session) {
    return auth;
  }

  if (auth.session.role !== Role.ADMIN) {
    return {
      session: null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return auth as { session: SessionPayload; response: null };
}
