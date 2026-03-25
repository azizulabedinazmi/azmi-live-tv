import { prisma } from "@/lib/prisma";
import { SyncStatus } from "@prisma/client";

type RepoConfig = {
  owner: string;
  repo: string;
  branch: string;
};

type GitHubCommitResponse = {
  sha: string;
};

type ChannelPayload = {
  name: string;
  url: string;
  logo?: string;
  group?: string;
};

type ChannelDataResponse = {
  info?: {
    last_update?: string;
  };
  channels?: ChannelPayload[];
};

function getRepoConfig(): RepoConfig {
  return {
    owner: process.env.SYNC_REPO_OWNER ?? "abusaeeidx",
    repo: process.env.SYNC_REPO_NAME ?? "Mrgify-BDIX-IPTV",
    branch: process.env.SYNC_REPO_BRANCH ?? "main",
  };
}

async function fetchLatestCommit(config: RepoConfig) {
  const commitUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/commits/${config.branch}`;
  const res = await fetch(commitUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch repository commit (${res.status})`);
  }

  const body = (await res.json()) as GitHubCommitResponse;
  return body.sha;
}

async function fetchChannelData(config: RepoConfig) {
  const rawUrl = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/Channels_data.json`;
  const res = await fetch(rawUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch Channels_data.json (${res.status})`);
  }

  const body = (await res.json()) as ChannelDataResponse;
  return {
    sourceUpdatedAt: body.info?.last_update ?? null,
    channels: (body.channels ?? []).filter((channel) => channel.name && channel.url),
  };
}

export async function getSyncDashboardStatus() {
  const config = getRepoConfig();

  const [state, recentLog, channelsCount] = await Promise.all([
    prisma.syncState.findUnique({ where: { id: 1 } }),
    prisma.syncLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.channel.count({ where: { isActive: true } }),
  ]);

  return {
    repository: `${config.owner}/${config.repo}`,
    branch: config.branch,
    channelsCount,
    state,
    recentLog,
  };
}

export async function syncChannels(actorId: string | null, force = false) {
  const config = getRepoConfig();
  const repository = `${config.owner}/${config.repo}`;

  try {
    const latestSha = await fetchLatestCommit(config);
    const currentState = await prisma.syncState.findUnique({ where: { id: 1 } });

    if (!force && currentState?.lastCommitSha === latestSha) {
      const skipped = await prisma.syncLog.create({
        data: {
          status: SyncStatus.SKIPPED,
          message: "Repository is already up to date.",
          commitSha: latestSha,
          channelsImported: currentState.channelCount,
          actorId,
        },
      });

      return {
        updated: false,
        sha: latestSha,
        channelsImported: currentState.channelCount,
        logId: skipped.id,
      };
    }

    const payload = await fetchChannelData(config);

    const importedCount = await prisma.$transaction(
      async (tx) => {
        const urlSet = payload.channels.map((channel) => channel.url.trim());

        for (const channel of payload.channels) {
          await tx.channel.upsert({
            where: { streamUrl: channel.url.trim() },
            update: {
              name: channel.name.trim(),
              logoUrl: channel.logo?.trim() || null,
              groupName: channel.group?.trim() || null,
              isActive: true,
              source: repository,
            },
            create: {
              name: channel.name.trim(),
              streamUrl: channel.url.trim(),
              logoUrl: channel.logo?.trim() || null,
              groupName: channel.group?.trim() || null,
              source: repository,
              isActive: true,
            },
          });
        }

        await tx.channel.updateMany({
          where: {
            source: repository,
            streamUrl: { notIn: urlSet },
          },
          data: { isActive: false },
        });

        await tx.syncState.upsert({
          where: { id: 1 },
          update: {
            repository,
            branch: config.branch,
            lastCommitSha: latestSha,
            sourceUpdatedAt: payload.sourceUpdatedAt,
            channelCount: payload.channels.length,
            lastSyncedAt: new Date(),
          },
          create: {
            id: 1,
            repository,
            branch: config.branch,
            lastCommitSha: latestSha,
            sourceUpdatedAt: payload.sourceUpdatedAt,
            channelCount: payload.channels.length,
            lastSyncedAt: new Date(),
          },
        });

        return payload.channels.length;
      },
      {
        maxWait: 10_000,
        timeout: 60_000,
      },
    );

    const syncLog = await prisma.syncLog.create({
      data: {
        status: SyncStatus.SUCCESS,
        message: "Channel list synced from repository.",
        commitSha: latestSha,
        channelsImported: importedCount,
        actorId,
      },
    });

    return {
      updated: true,
      sha: latestSha,
      channelsImported: importedCount,
      logId: syncLog.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

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
