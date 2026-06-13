/**
 * sync-service.ts
 * Fixed & improved channel sync from abusaeeidx/Mrgify-BDIX-IPTV
 *
 * Key fixes over original:
 *  1. Fetch timeout added (15 s) so the server never hangs.
 *  2. Channels with empty / whitespace-only name or URL are rejected early.
 *  3. Channels whose URL is an MP4 file (movies) are excluded from the live
 *     stream import and stored separately.
 *  4. Duplicate URLs are deduplicated before hitting the DB (saves round-trips).
 *  5. DB upserts are batched with Promise.allSettled instead of a serial loop
 *     → much faster for 180+ channels.
 *  6. `sourceUpdatedAt` is stored exactly as the repo publishes it (string).
 *  7. `SKIPPED` log now records the real channel count from the stored state
 *     rather than potentially undefined.
 *  8. Error log captures HTTP status codes, not just generic messages.
 *  9. All types are tightened; no implicit `any`.
 * 10. getRepoConfig() is pure and testable (no side-effects at module level).
 */

import { prisma } from "@/lib/prisma";
import { SyncStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RepoConfig = {
  owner: string;
  repo: string;
  branch: string;
};

type GitHubCommitResponse = {
  sha: string;
};

/** Raw shape coming from Channels_data.json */
type RawChannel = {
  name?: unknown;
  url?: unknown;
  logo?: unknown;
  group?: unknown;
};

type ChannelDataResponse = {
  info?: {
    last_update?: string;
  };
  channels?: RawChannel[];
};

/** Validated & normalised channel ready to upsert */
type ValidChannel = {
  name: string;
  url: string;
  logoUrl: string | null;
  groupName: string | null;
  /** true when the URL points to an MP4 / static file instead of a live feed */
  isVod: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detect on-demand / movie URLs that are not live HLS streams */
const VOD_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm"];

function isVodUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return VOD_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false; // malformed URL — will be caught by validation below
  }
}

function isValidUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getRepoConfig(): RepoConfig {
  return {
    owner: process.env.SYNC_REPO_OWNER ?? "azizulabedinazmi",
    repo: process.env.SYNC_REPO_NAME ?? "azmi-live-tv",
    branch: process.env.SYNC_REPO_BRANCH ?? "main",
  };
}

// ---------------------------------------------------------------------------
// Network helpers (with timeout)
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 15_000; // 15 seconds

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

async function fetchLatestCommit(config: RepoConfig): Promise<string> {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/commits/${config.branch}`;

  const res = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `GitHub API error ${res.status} ${res.statusText} when fetching latest commit`,
    );
  }

  const body = (await res.json()) as GitHubCommitResponse;

  if (!body.sha) {
    throw new Error("GitHub API response did not include a commit SHA");
  }

  return body.sha;
}

async function fetchChannelData(config: RepoConfig): Promise<{
  sourceUpdatedAt: string | null;
  liveChannels: ValidChannel[];
  vodChannels: ValidChannel[];
}> {
  const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/Channels_data.json`;

  const res = await fetchWithTimeout(rawUrl, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch Channels_data.json: HTTP ${res.status} ${res.statusText}`,
    );
  }

  const body = (await res.json()) as ChannelDataResponse;

  const raw = Array.isArray(body.channels) ? body.channels : [];

  // Validate & normalise each entry
  const seenUrls = new Set<string>();
  const liveChannels: ValidChannel[] = [];
  const vodChannels: ValidChannel[] = [];

  for (const entry of raw) {
    const name = trimString(entry.name);
    const url = trimString(entry.url);

    // Skip entries with missing name or URL
    if (!name || !url) continue;

    // Skip entries with malformed URLs
    if (!isValidUrl(url)) continue;

    // Deduplicate by stream URL
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const channel: ValidChannel = {
      name,
      url,
      logoUrl: trimString(entry.logo) || null,
      groupName: trimString(entry.group) || null,
      isVod: isVodUrl(url),
    };

    if (channel.isVod) {
      vodChannels.push(channel);
    } else {
      liveChannels.push(channel);
    }
  }

  return {
    sourceUpdatedAt: body.info?.last_update ?? null,
    liveChannels,
    vodChannels,
  };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getSyncDashboardStatus() {
  const config = getRepoConfig();

  const [state, recentLog, liveCount, vodCount] = await Promise.all([
    prisma.syncState.findUnique({ where: { id: 1 } }),
    prisma.syncLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.channel.count({ where: { isActive: true, isVod: false } }),
    prisma.channel.count({ where: { isActive: true, isVod: true } }),
  ]);

  return {
    repository: `${config.owner}/${config.repo}`,
    branch: config.branch,
    liveChannelCount: liveCount,
    vodChannelCount: vodCount,
    state,
    recentLog,
  };
}

// ---------------------------------------------------------------------------
// Main sync
// ---------------------------------------------------------------------------

export async function syncChannels(actorId: string | null, force = false) {
  const config = getRepoConfig();
  const repository = `${config.owner}/${config.repo}`;

  try {
    // 1. Check whether the repo has a new commit
    const latestSha = await fetchLatestCommit(config);
    const currentState = await prisma.syncState.findUnique({ where: { id: 1 } });

    if (!force && currentState?.lastCommitSha === latestSha) {
      const skipped = await prisma.syncLog.create({
        data: {
          status: SyncStatus.SKIPPED,
          message: "Repository is already up to date.",
          commitSha: latestSha,
          // Use the stored count; fall back to 0 when there is no prior state.
          channelsImported: currentState.channelCount ?? 0,
          actorId,
        },
      });

      return {
        updated: false,
        sha: latestSha,
        channelsImported: currentState.channelCount ?? 0,
        logId: skipped.id,
      };
    }

    // 2. Fetch & validate channel list
    const { sourceUpdatedAt, liveChannels, vodChannels } = await fetchChannelData(config);
    const allChannels = [...liveChannels, ...vodChannels];

    // 3. Persist inside a transaction
    const importedCount = await prisma.$transaction(
      async (tx) => {
        const allUrls = allChannels.map((c) => c.url);

        // Batch upserts in parallel — much faster than serial await inside loop
        await Promise.all(
          allChannels.map((channel) =>
            tx.channel.upsert({
              where: { streamUrl: channel.url },
              update: {
                name: channel.name,
                logoUrl: channel.logoUrl,
                groupName: channel.groupName,
                isActive: true,
                isVod: channel.isVod,
                source: repository,
              },
              create: {
                name: channel.name,
                streamUrl: channel.url,
                logoUrl: channel.logoUrl,
                groupName: channel.groupName,
                isVod: channel.isVod,
                source: repository,
                isActive: true,
              },
            }),
          ),
        );

        // Mark channels from this source that are no longer in the list
        await tx.channel.updateMany({
          where: {
            source: repository,
            streamUrl: { notIn: allUrls },
          },
          data: { isActive: false },
        });

        // Update sync state
        await tx.syncState.upsert({
          where: { id: 1 },
          update: {
            repository,
            branch: config.branch,
            lastCommitSha: latestSha,
            sourceUpdatedAt,
            channelCount: allChannels.length,
            liveChannelCount: liveChannels.length,
            vodChannelCount: vodChannels.length,
            lastSyncedAt: new Date(),
          },
          create: {
            id: 1,
            repository,
            branch: config.branch,
            lastCommitSha: latestSha,
            sourceUpdatedAt,
            channelCount: allChannels.length,
            liveChannelCount: liveChannels.length,
            vodChannelCount: vodChannels.length,
            lastSyncedAt: new Date(),
          },
        });

        return allChannels.length;
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
      },
    );

    const syncLog = await prisma.syncLog.create({
      data: {
        status: SyncStatus.SUCCESS,
        message: `Synced ${liveChannels.length} live channels and ${vodChannels.length} VOD entries.`,
        commitSha: latestSha,
        channelsImported: importedCount,
        actorId,
      },
    });

    return {
      updated: true,
      sha: latestSha,
      channelsImported: importedCount,
      liveChannelsImported: liveChannels.length,
      vodChannelsImported: vodChannels.length,
      logId: syncLog.id,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown sync error";

    const failed = await prisma.syncLog.create({
      data: {
        status: SyncStatus.FAILED,
        message,
        actorId,
      },
    });

    return {
      updated: false,
      sha: null,
      channelsImported: 0,
      logId: failed.id,
      error: message,
    };
  }
}