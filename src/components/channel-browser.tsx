"use client";

import Hls from "hls.js";
import { Heart, Play, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Channel = {
  id: number;
  name: string;
  streamUrl: string;
  logoUrl: string | null;
  groupName: string | null;
  isFavorite: boolean;
};

type ChannelApiPayload = {
  channels: Channel[];
  groups: string[];
};

export function ChannelBrowser() {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("q", search.trim());
    }
    if (group) {
      params.set("group", group);
    }
    if (favoritesOnly) {
      params.set("favoritesOnly", "true");
    }

    const res = await fetch(`/api/channels?${params.toString()}`);
    if (!res.ok) {
      setLoading(false);
      setError("Failed to load channels.");
      return;
    }

    const data = (await res.json()) as ChannelApiPayload;
    setChannels(data.channels);
    setGroups(data.groups);
    setSelected((current) => {
      if (!current) {
        return data.channels[0] ?? null;
      }

      return data.channels.find((channel) => channel.id === current.id) ?? data.channels[0] ?? null;
    });
    setLoading(false);
  }, [favoritesOnly, group, search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchChannels();
    }, 150);

    return () => clearTimeout(timeout);
  }, [fetchChannels]);

  useEffect(() => {
    if (!selected || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    let hls: Hls | null = null;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = selected.streamUrl;
      void video.play().catch(() => undefined);
      return;
    }

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(selected.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined);
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [selected]);

  async function toggleFavorite(channel: Channel) {
    const method = channel.isFavorite ? "DELETE" : "POST";

    const res = await fetch("/api/favorites", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: channel.id }),
    });

    if (!res.ok) {
      setError("Could not update favorite.");
      return;
    }

    setChannels((current) =>
      current.map((item) =>
        item.id === channel.id
          ? {
              ...item,
              isFavorite: !item.isFavorite,
            }
          : item,
      ),
    );
  }

  const favoritesCount = useMemo(
    () => channels.filter((channel) => channel.isFavorite).length,
    [channels],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
      <section className="glass-card rounded-3xl p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Now playing</p>
            <h2 className="text-2xl font-semibold text-white">{selected?.name ?? "No channel selected"}</h2>
          </div>
          <span className="badge">{channels.length} channels</span>
        </div>

        <div className="player-wrap">
          <video ref={videoRef} controls className="h-full w-full" />
        </div>

      </section>

      <section className="glass-card rounded-3xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="input-wrap grow min-w-[180px]">
            <Search size={16} />
            <input
              placeholder="Search channel"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select className="input !w-auto" value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">All groups</option>
            {groups.map((groupItem) => (
              <option value={groupItem} key={groupItem}>
                {groupItem}
              </option>
            ))}
          </select>
          <button
            className={`btn-ghost ${favoritesOnly ? "btn-ghost--active" : ""}`}
            onClick={() => setFavoritesOnly((current) => !current)}
            type="button"
          >
            <Heart size={16} />
            {favoritesOnly ? "Favorites" : `Favorites (${favoritesCount})`}
          </button>
        </div>

        {error ? <p className="mb-2 text-sm text-rose-300">{error}</p> : null}

        <div className="channel-list max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {loading ? <p className="text-sm text-slate-300">Loading channels...</p> : null}

          {!loading && channels.length === 0 ? (
            <p className="text-sm text-slate-300">No channels found for this filter.</p>
          ) : null}

          {channels.map((channel) => (
            <article
              className={`channel-card ${selected?.id === channel.id ? "channel-card--active" : ""}`}
              key={channel.id}
            >
              <button className="channel-main" onClick={() => setSelected(channel)} type="button">
                <Play size={14} />
                <span className="truncate">{channel.name}</span>
              </button>
              <button
                className={`favorite-btn ${channel.isFavorite ? "favorite-btn--active" : ""}`}
                onClick={() => toggleFavorite(channel)}
                type="button"
                aria-label="Toggle favorite"
              >
                <Heart size={14} />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
