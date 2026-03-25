"use client";

import { LockKeyhole, TvMinimalPlay } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const nextPathRef = useRef("/dashboard");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const next = new URLSearchParams(window.location.search).get("next");
    if (next) {
      nextPathRef.current = next;
    }
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Login failed");
      return;
    }

    router.push(nextPathRef.current);
  }

  return (
    <main className="page-bg min-h-screen p-6 sm:p-10">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="glass-card grid w-full overflow-hidden rounded-4xl lg:grid-cols-[1.2fr_1fr]">
          <div className="relative hidden min-h-[430px] p-8 lg:block">
            <div className="glow-orb absolute -left-16 top-20 h-56 w-56" />
            <div className="glow-orb glow-orb--secondary absolute bottom-6 right-10 h-40 w-40" />
            <div className="relative z-10">
              <p className="eyebrow">Live streaming studio</p>
              <h1 className="hero-title mt-2">Azmi Live TV</h1>
              <p className="mt-4 max-w-md text-slate-200/85">
                Secure account access, personalized favorites, and an admin control room that syncs channels directly from your GitHub source.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-9">
            <div className="mb-8 flex items-center gap-3 text-slate-100">
              <TvMinimalPlay className="text-cyan-300" size={24} />
              <span className="text-sm uppercase tracking-[0.22em] text-slate-300">Secure Login</span>
            </div>

            <form className="space-y-4" onSubmit={onSubmit}>
              <label className="block text-sm text-slate-200">
                Username
                <input
                  className="input mt-2"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="block text-sm text-slate-200">
                Password
                <input
                  className="input mt-2"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </label>

              {error ? <p className="text-sm text-rose-300">{error}</p> : null}

              <button className="btn-primary mt-2 w-full" disabled={loading} type="submit">
                <LockKeyhole size={16} />
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="mt-6 text-xs text-slate-400">
              First admin user is created using ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD from your environment.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
