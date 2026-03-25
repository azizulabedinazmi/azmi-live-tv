import type { Role } from "@prisma/client";
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "azmi_live_tv_session";

export type SessionPayload = {
  userId: string;
  username: string;
  role: Role;
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable.");
  }

  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());

  return {
    userId: String(payload.userId),
    username: String(payload.username),
    role: payload.role as Role,
  } satisfies SessionPayload;
}

export function getSessionMaxAge() {
  return SESSION_TTL_SECONDS;
}
