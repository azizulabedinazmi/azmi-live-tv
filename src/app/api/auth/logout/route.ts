import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE, SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const session = await verifySessionToken(token);
      await prisma.userDeviceSession.updateMany({
        where: {
          userId: session.userId,
          deviceId: session.deviceId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } catch {
      // Ignore invalid tokens during logout.
    }
  }

  const response = NextResponse.json({ ok: true });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  response.cookies.set({
    name: DEVICE_COOKIE,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  return response;
}
