"use client";

import { LogOut, Shield, Tv, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type TopNavProps = {
  username: string;
  role: "ADMIN" | "USER";
};

export function TopNav({ username, role }: TopNavProps) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="glass-card sticky top-3 z-20 mb-4 flex items-center justify-between rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2 text-white">
        <Tv className="text-cyan-300" size={20} />
        <span className="text-sm font-semibold tracking-[0.2em] uppercase">Azmi Live TV</span>
      </div>

      <nav className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="btn-ghost">
          <Tv size={14} />
          Dashboard
        </Link>
        {role === "ADMIN" ? (
          <Link href="/admin" className="btn-ghost">
            <Shield size={14} />
            Admin
          </Link>
        ) : null}
        <span className="badge">
          <UserRound size={13} />
          {username}
        </span>
        <button className="btn-ghost" onClick={logout} type="button">
          <LogOut size={14} />
          Logout
        </button>
      </nav>
    </header>
  );
}
