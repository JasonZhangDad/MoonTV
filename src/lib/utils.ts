/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

export const VIDEO_SPEED_TEST_CONCURRENCY = 4;
const PLAYLIST_TEST_TIMEOUT_MS = 3000;
const VARIANT_PLAYLIST_TIMEOUT_MS = 2500;
const SEGMENT_SPEED_TEST_TIMEOUT_MS = 2500;
const SEGMENT_SPEED_TEST_MAX_BYTES = 1024 * 1024;
const MIN_SEGMENT_SPEED_TEST_BYTES = 32 * 1024;

/**
 * 图片代理已停用。
 */
export function getImageProxyUrl(): string | null {
  return null;
}

/**
 * 处理图片 URL，始终返回原始直连地址。
 */
export function processImageUrl(originalUrl: string): string {
  return originalUrl ? extractOriginalUrl(originalUrl) : originalUrl;
}

/**
 * 获取图片加载候选地址，按优先级返回。
 * 针对豆瓣图片使用 Caddy 反向代理以解决防盗链和 CORS 问题。
 */
export function getImageProxyCandidates(originalUrl: string): string[] {
  if (!originalUrl) return [];

  const sourceUrl = extractOriginalUrl(originalUrl);
  const candidates = new Set<string>();

  // 针对豆瓣域名自动使用 Caddy 反代
  if (sourceUrl.includes('doubanio.com')) {
    try {
      const urlObj = new URL(sourceUrl);
      candidates.add(`/douban-img${urlObj.pathname}`);
    } catch {
      // 忽略无效 URL
    }
  }

  candidates.add(sourceUrl);

  return Array.from(candidates);
}

function extractOriginalUrl(url: string): string {
  try {
    const parsed = new URL(
      url,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost'
    );
    const proxiedUrl = parsed.searchParams.get('url');
    return proxiedUrl ? decodeURIComponent(proxiedUrl) : url;
  } catch {
    return url;
  }
}

/**
 * 获取豆瓣代理 URL 设置
 */
export function getDoubanProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  // 本地未开启豆瓣代理，则不使用代理
  const enableDoubanProxy = localStorage.getItem('enableDoubanProxy');
  if (enableDoubanProxy !== null) {
    if (!JSON.parse(enableDoubanProxy) as boolean) {
      return null;
    }
  }

  const localDoubanProxy = localStorage.getItem('doubanProxyUrl');
  if (localDoubanProxy != null) {
    return localDoubanProxy.trim() ? localDoubanProxy.trim() : null;
  }

  // 如果未设置，则使用全局对象
  const serverDoubanProxy = (window as any).RUNTIME_CONFIG?.DOUBAN_PROXY;
  return serverDoubanProxy && serverDoubanProxy.trim()
    ? serverDoubanProxy.trim()
    : null;
}

/**
 * 处理豆瓣 URL，如果设置了豆瓣代理则使用代理
 */
export function processDoubanUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getDoubanProxyUrl();
  if (!proxyUrl) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 获取视频播放 URL 候选。播放链路始终直连，不回退播放代理。
 */
export function getVideoUrlCandidates(originalUrl: string): string[] {
  if (!originalUrl) return [];

  const sourceUrl = extractOriginalUrl(originalUrl);
  return [sourceUrl];
}

/**
 * 处理视频播放 URL，始终返回原始直连地址。
 */
export function processVideoUrl(originalUrl: string): string {
  return getVideoUrlCandidates(originalUrl)[0] || originalUrl;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        try {
          results[currentIndex] = {
            status: 'fulfilled',
            value: await worker(items[currentIndex], currentIndex),
          };
        } catch (reason) {
          results[currentIndex] = {
            status: 'rejected',
            reason,
          };
        }
      }
    })
  );

  return results;
}

function formatSpeed(bytes: number, elapsedMs: number): string {
  if (bytes <= 0 || elapsedMs <= 0) return '未知';

  const speedKBps = bytes / 1024 / (elapsedMs / 1000);
  return speedKBps >= 1024
    ? `${(speedKBps / 1024).toFixed(1)} MB/s`
    : `${speedKBps.toFixed(1)} KB/s`;
}

function getPlaylistByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function resolvePlaylistUrl(uri: string, baseUrl: string): string {
  try {
    return new URL(uri, extractOriginalUrl(baseUrl)).toString();
  } catch {
    return uri;
  }
}

function parseQualityFromPlaylist(text: string): string {
  const resMatches = Array.from(text.matchAll(/RESOLUTION=(\d+)x(\d+)/gi));
  if (resMatches.length === 0) return '未知';

  const maxH = Math.max(...resMatches.map((m) => parseInt(m[2])));
  return maxH >= 2160
    ? '4K'
    : maxH >= 1440
    ? '2K'
    : maxH >= 1080
    ? '1080p'
    : maxH >= 720
    ? '720p'
    : maxH >= 480
    ? '480p'
    : 'SD';
}

function findBestVariantUrl(text: string, baseUrl: string): string | null {
  const lines = text.split(/\r?\n/);
  let bestVariant: { height: number; url: string } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.toUpperCase().startsWith('#EXT-X-STREAM-INF')) continue;

    const resolution = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const height = resolution ? parseInt(resolution[2]) : 0;
    const uri = lines
      .slice(i + 1)
      .map((nextLine) => nextLine.trim())
      .find((nextLine) => nextLine && !nextLine.startsWith('#'));

    if (uri && (!bestVariant || height > bestVariant.height)) {
      bestVariant = {
        height,
        url: resolvePlaylistUrl(uri, baseUrl),
      };
    }
  }

  return bestVariant?.url ?? null;
}

function findFirstSegmentUrl(text: string, baseUrl: string): string | null {
  const lines = text.split(/\r?\n/);
  let expectSegment = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.toUpperCase().startsWith('#EXTINF')) {
      expectSegment = true;
      continue;
    }

    if (line.startsWith('#')) continue;

    if (expectSegment || /\.(ts|m4s|mp4|m4v|aac|mp3)(\?|#|$)/i.test(line)) {
      return resolvePlaylistUrl(line, baseUrl);
    }
  }

  return null;
}

async function fetchPlaylistText(
  playlistUrl: string,
  timeoutMs: number
): Promise<string> {
  for (const url of getVideoUrlCandidates(playlistUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (_error) {
      void _error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('playlist unreachable');
}

async function measureSegmentSpeed(segmentUrl: string): Promise<{
  bytes: number;
  elapsedMs: number;
}> {
  let lastError: unknown;

  for (const url of getVideoUrlCandidates(segmentUrl)) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      SEGMENT_SPEED_TEST_TIMEOUT_MS
    );
    const start = performance.now();
    let bytes = 0;

    try {
      const res = await fetch(url, {
        headers: {
          Range: `bytes=0-${SEGMENT_SPEED_TEST_MAX_BYTES - 1}`,
        },
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (!res.body) {
        const buffer = await res.arrayBuffer();
        bytes = Math.min(buffer.byteLength, SEGMENT_SPEED_TEST_MAX_BYTES);
      } else {
        const reader = res.body.getReader();
        try {
          while (bytes < SEGMENT_SPEED_TEST_MAX_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      }

      if (bytes < MIN_SEGMENT_SPEED_TEST_BYTES) {
        throw new Error('segment sample too small');
      }

      return {
        bytes,
        elapsedMs: performance.now() - start,
      };
    } catch (error) {
      if (bytes >= MIN_SEGMENT_SPEED_TEST_BYTES) {
        return {
          bytes,
          elapsedMs: performance.now() - start,
        };
      }
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('segment unreachable');
}

async function getSegmentSpeedFromPlaylist(
  playlistText: string,
  playlistUrl: string
): Promise<string | null> {
  const variantUrl = findBestVariantUrl(playlistText, playlistUrl);
  let mediaPlaylistText = playlistText;
  let mediaPlaylistUrl = playlistUrl;

  if (variantUrl) {
    mediaPlaylistText = await fetchPlaylistText(
      variantUrl,
      VARIANT_PLAYLIST_TIMEOUT_MS
    );
    mediaPlaylistUrl = variantUrl;
  }

  const segmentUrl = findFirstSegmentUrl(mediaPlaylistText, mediaPlaylistUrl);
  if (!segmentUrl) return null;

  const speed = await measureSegmentSpeed(segmentUrl);
  return formatSpeed(speed.bytes, speed.elapsedMs);
}

/**
 * 通过 fetch m3u8 快速测试源的可用性和质量。
 * 优先读取真实媒体分片的前 1MB 估算速度，失败时退回 m3u8 文本速度。
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
}> {
  for (const url of getVideoUrlCandidates(m3u8Url)) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      PLAYLIST_TEST_TIMEOUT_MS
    );
    const start = performance.now();

    try {
      const res = await fetch(url, { signal: controller.signal });
      const pingTime = Math.round(performance.now() - start);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const elapsed = performance.now() - start;

      const playlistSpeed = formatSpeed(getPlaylistByteLength(text), elapsed);
      const segmentSpeed = await getSegmentSpeedFromPlaylist(text, url).catch(
        () => null
      );

      return {
        quality: parseQualityFromPlaylist(text),
        loadSpeed: segmentSpeed ?? playlistSpeed,
        pingTime,
      };
    } catch (_error) {
      void _error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('source unreachable');
}
