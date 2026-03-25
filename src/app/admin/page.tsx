"use client";

import { TopNav } from "@/components/top-nav";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Shield, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type UserRole = "ADMIN" | "USER";

type StatusPayload = {
  repository: string;
  branch: string;
  channelsCount: number;
  state: {
    lastCommitSha: string | null;
    sourceUpdatedAt: string | null;
    lastSyncedAt: string | null;
    channelCount: number;
  } | null;
  recentLog: {
    status: "SUCCESS" | "SKIPPED" | "FAILED";
    message: string;
    createdAt: string;
  } | null;
};

type UserPayload = {
  id: string;
  username: string;
  role: UserRole;
  isBanned: boolean;
  maxDevices: number;
  createdAt: string;
};

export default function AdminPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [users, setUsers] = useState<UserPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [deviceLimits, setDeviceLimits] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    const [statusRes, usersRes] = await Promise.all([
      fetch("/api/admin/status"),
      fetch("/api/admin/users"),
    ]);

    if (!statusRes.ok || !usersRes.ok) {
      setError("Failed to load admin data.");
      setLoading(false);
      return;
    }

    const [statusJson, usersJson] = await Promise.all([statusRes.json(), usersRes.json()]);
    setStatus(statusJson as StatusPayload);
    const fetchedUsers = (usersJson as { users: UserPayload[] }).users;
    setUsers(fetchedUsers);
    setDeviceLimits(
      fetchedUsers.reduce<Record<string, number>>((acc, user) => {
        acc[user.id] = user.maxDevices;
        return acc;
      }, {}),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runSync(force: boolean) {
    setSyncing(true);
    setError(null);

    const res = await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });

    setSyncing(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Sync failed");
      return;
    }

    await loadData();
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not create user");
      return;
    }

    setUsername("");
    setPassword("");
    setRole("USER");
    await loadData();
  }

  async function moderateUser(userId: string, action: "ban" | "unban") {
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update user status");
      return;
    }

    await loadData();
  }

  async function deleteUser(userId: string) {
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not delete user");
      return;
    }

    await loadData();
  }

  async function updateDeviceLimit(userId: string) {
    setError(null);

    const limit = deviceLimits[userId];
    if (!limit || limit < 1) {
      setError("Device limit must be at least 1.");
      return;
    }

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        action: "set_device_limit",
        deviceLimit: limit,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not update device limit");
      return;
    }

    await loadData();
  }

  const friendlySyncTime = status?.state?.lastSyncedAt
    ? formatDistanceToNow(new Date(status.state.lastSyncedAt), { addSuffix: true })
    : "Never";

  return (
    <main className="page-bg min-h-screen p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <TopNav username="Admin" role="ADMIN" />

        {loading ? <p className="text-slate-100">Loading admin panel...</p> : null}

        {!loading && status ? (
          <div className="space-y-5">
            <section className="glass-card rounded-3xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Repository sync control</p>
                  <h1 className="text-2xl font-semibold text-white">Admin Control Room</h1>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-primary" type="button" disabled={syncing} onClick={() => runSync(false)}>
                    <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                    {syncing ? "Refreshing..." : "Refresh / Check Sync"}
                  </button>
                  <button className="btn-ghost" type="button" disabled={syncing} onClick={() => runSync(true)}>
                    Force Full Sync
                  </button>
                </div>
              </div>

              {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="stat-box">
                  <p className="stat-label">Repository</p>
                  <p className="stat-value">{status.repository}</p>
                  <p className="stat-meta">Branch: {status.branch}</p>
                </article>
                <article className="stat-box">
                  <p className="stat-label">Last Commit</p>
                  <p className="stat-value truncate">{status.state?.lastCommitSha?.slice(0, 10) ?? "None"}</p>
                  <p className="stat-meta">Channels: {status.channelsCount}</p>
                </article>
                <article className="stat-box">
                  <p className="stat-label">Last Synced</p>
                  <p className="stat-value">{friendlySyncTime}</p>
                  <p className="stat-meta">Source time: {status.state?.sourceUpdatedAt ?? "N/A"}</p>
                </article>
                <article className="stat-box">
                  <p className="stat-label">Recent Log</p>
                  <p className="stat-value">{status.recentLog?.status ?? "N/A"}</p>
                  <p className="stat-meta">{status.recentLog?.message ?? "No logs yet"}</p>
                </article>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <div className="glass-card rounded-3xl p-5 sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-white">
                  <UserPlus className="text-cyan-300" size={18} />
                  <h2 className="text-xl font-semibold">Create User</h2>
                </div>

                <form className="space-y-3" onSubmit={createUser}>
                  <input
                    className="input"
                    placeholder="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                  <input
                    className="input"
                    placeholder="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <select className="input" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>

                  <button className="btn-primary w-full" type="submit">
                    <Shield size={14} />
                    Add User
                  </button>
                </form>
              </div>

              <div className="glass-card rounded-3xl p-5 sm:p-6">
                <h2 className="mb-4 text-xl font-semibold text-white">User Accounts</h2>
                <div className="space-y-2">
                  {users.map((user) => (
                    <article className="channel-card" key={user.id}>
                      <div className="channel-main flex flex-col items-start">
                        <Shield size={14} />
                        <span>{user.username}</span>
                        {user.isBanned ? <span className="text-xs text-rose-300">BANNED</span> : null}
                        <span className="text-xs text-slate-300">Device limit: {user.maxDevices}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge">{user.role}</span>
                        <input
                          className="input !w-20"
                          type="number"
                          min={1}
                          max={10}
                          value={deviceLimits[user.id] ?? user.maxDevices}
                          onChange={(event) =>
                            setDeviceLimits((current) => ({
                              ...current,
                              [user.id]: Number(event.target.value),
                            }))
                          }
                        />
                        <button className="btn-ghost" onClick={() => updateDeviceLimit(user.id)} type="button">
                          Save Limit
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => moderateUser(user.id, user.isBanned ? "unban" : "ban")}
                          type="button"
                        >
                          {user.isBanned ? "Unban" : "Ban"}
                        </button>
                        <button className="btn-ghost" onClick={() => deleteUser(user.id)} type="button">
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
