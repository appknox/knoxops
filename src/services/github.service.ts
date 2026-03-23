import { env } from '../config/env.js';

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  contentType: string;
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
  zipballUrl: string;
}

interface GitHubReleaseResponse {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  zipball_url: string;
  assets: Array<{
    id: number;
    name: string;
    size: number;
    content_type: string;
  }>;
}

// In-memory cache expires after 5 minutes
let cache: { data: GitHubRelease[]; expiresAt: number } | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000;

/**
 * List all releases from the configured GitHub repository
 */
export async function listReleases(): Promise<GitHubRelease[]> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new Error('GitHub configuration missing (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)');
  }

  // Check cache
  if (cache && cache.expiresAt > Date.now()) {
    console.log('Returning cached releases');
    return cache.data;
  }

  try {
    const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const releases: GitHubReleaseResponse[] = await response.json();

    // Filter out drafts and map to our interface
    const mapped = releases
      .filter((r) => !r.draft)
      .map((r) => ({
        id: r.id,
        tagName: r.tag_name,
        name: r.name,
        body: r.body,
        publishedAt: r.published_at,
        draft: r.draft,
        prerelease: r.prerelease,
        zipballUrl: r.zipball_url,
        assets: r.assets.map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          contentType: a.content_type,
        })),
      }));

    // Cache the result
    cache = {
      data: mapped,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    };

    return mapped;
  } catch (error) {
    console.error('Failed to fetch releases from GitHub:', error);
    throw error;
  }
}

/**
 * Stream a release asset from GitHub
 */
export async function streamAsset(
  releaseId: number,
  assetId: number
): Promise<{ stream: ReadableStream; contentType: string; filename: string }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new Error('GitHub configuration missing');
  }

  try {
    const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/releases/assets/${assetId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/octet-stream',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to download asset: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Extract filename from content-disposition header or use a default
    const contentDisposition = response.headers.get('content-disposition');
    let filename = `asset-${assetId}`;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=(?:(['"]).*?\1|[^;\n]*)/);
      if (match) {
        filename = match[0].split('=')[1].replace(/['"]/g, '');
      }
    }

    return {
      stream: response.body as ReadableStream,
      contentType,
      filename,
    };
  } catch (error) {
    console.error('Failed to stream asset:', error);
    throw error;
  }
}

/**
 * Stream the source zipball for a release (private repo requires auth)
 */
export async function streamZipball(
  releaseId: number
): Promise<{ stream: ReadableStream; filename: string }> {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    throw new Error('GitHub configuration missing');
  }

  // Find the release in cache to get its zipball URL and tagName
  const releases = cache?.data ?? await listReleases();
  const release = releases.find((r) => r.id === releaseId);
  if (!release) {
    throw new Error(`Release ${releaseId} not found`);
  }

  const response = await fetch(release.zipballUrl, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Failed to download zipball: ${response.status} ${response.statusText}`);
  }

  return {
    stream: response.body as ReadableStream,
    filename: `${release.tagName}-source.zip`,
  };
}

/**
 * Clear the releases cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
  cache = null;
}
