/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

const DEFAULT_VIDEO_PROXY = 'https://play.magies.top/?url=';
const DEFAULT_IMAGE_PROXY = 'https://img.magies.top/?url=';
const IMAGE_PROXY_FALLBACK = '/api/image-proxy?url=';
const VIDEO_PROXY_BYPASS_HOST_PATTERNS = [
  /(^|\.)ffzy-play\d+\.com$/i,
];

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return localImageProxy.trim()
      ? normalizeProxyPrefix(localImageProxy.trim())
      : DEFAULT_IMAGE_PROXY;
  }

  // 如果未设置，则使用全局对象
  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? normalizeProxyPrefix(serverImageProxy.trim())
    : DEFAULT_IMAGE_PROXY;
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) return originalUrl;
  if (originalUrl.startsWith(proxyUrl)) return originalUrl;

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

/**
 * 获取图片代理候选地址，按优先级返回。
 */
export function getImageProxyCandidates(originalUrl: string): string[] {
  if (!originalUrl) return [];

  const sourceUrl = extractOriginalUrl(originalUrl);
  const proxyUrl = getImageProxyUrl();
  const candidates = new Set<string>();

  if (proxyUrl) {
    candidates.add(`${proxyUrl}${encodeURIComponent(sourceUrl)}`);
  }

  candidates.add(`${IMAGE_PROXY_FALLBACK}${encodeURIComponent(sourceUrl)}`);
  candidates.add(sourceUrl);

  return Array.from(candidates);
}

function normalizeProxyPrefix(proxyUrl: string): string {
  if (!proxyUrl) return proxyUrl;
  if (proxyUrl.includes('?url=')) return proxyUrl;
  if (proxyUrl.endsWith('?url=')) return proxyUrl;

  return `${proxyUrl.replace(/[/?&]+$/, '')}/?url=`;
}

function extractOriginalUrl(url: string): string {
  try {
    const parsed = new URL(
      url,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
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
 * 处理视频播放 URL，统一走播放代理
 */
export function processVideoUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  if (originalUrl.startsWith(DEFAULT_VIDEO_PROXY)) return originalUrl;
  if (shouldBypassVideoProxy(originalUrl)) return originalUrl;
  return `${DEFAULT_VIDEO_PROXY}${encodeURIComponent(originalUrl)}`;
}

function shouldBypassVideoProxy(originalUrl: string): boolean {
  try {
    const { hostname } = new URL(originalUrl);
    return VIDEO_PROXY_BYPASS_HOST_PATTERNS.some((pattern) =>
      pattern.test(hostname)
    );
  } catch {
    return false;
  }
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

/**
 * 通过 fetch m3u8 快速测试源的可用性和质量。
 * 比原来加载完整视频分片的方式快 10x 以上（~200ms vs ~3000ms）。
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
}> {
  const proxied = processVideoUrl(m3u8Url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const start = performance.now();

  try {
    const res = await fetch(proxied, { signal: controller.signal });
    const pingTime = Math.round(performance.now() - start);
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    const elapsed = performance.now() - start;

    // 根据下载字节数和耗时估算速度
    const speedKBps = (text.length / 1024) / (elapsed / 1000);
    const loadSpeed =
      speedKBps >= 1024
        ? `${(speedKBps / 1024).toFixed(1)} MB/s`
        : `${speedKBps.toFixed(1)} KB/s`;

    // 从 master playlist 的 RESOLUTION= 解析最高画质
    const resMatches = Array.from(text.matchAll(/RESOLUTION=(\d+)x(\d+)/gi));
    let quality = '未知';
    if (resMatches.length > 0) {
      const maxH = Math.max(...resMatches.map((m) => parseInt(m[2])));
      quality =
        maxH >= 2160 ? '4K' :
        maxH >= 1440 ? '2K' :
        maxH >= 1080 ? '1080p' :
        maxH >= 720  ? '720p' :
        maxH >= 480  ? '480p' : 'SD';
    }

    return { quality, loadSpeed, pingTime };
  } catch {
    throw new Error('source unreachable');
  } finally {
    clearTimeout(timer);
  }
}
