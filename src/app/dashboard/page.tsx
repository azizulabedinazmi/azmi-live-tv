"use client";

import { ChannelBrowser } from "@/components/channel-browser";
import { TopNav } from "@/components/top-nav";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type MeResponse = {
  user: {
    userId: string;
    username: string;
    role: "ADMIN" | "USER";
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      router.push("/login");
      return;
    }

    const data = (await res.json()) as MeResponse;
    setMe(data.user);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  if (loading || !me) {
    return (
      <main className="page-bg min-h-screen p-6 text-white">
        <p>Loading dashboard...</p>
      </main>
    );
  }

  return (
    <main className="page-bg min-h-screen p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <TopNav username={me.username} role={me.role} />
        <ChannelBrowser />
      </div>
    </main>
  );
}
