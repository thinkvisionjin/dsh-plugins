import { readFileSync } from 'node:fs';
import {
  DEFAULT_UPDATE_SOURCE_FALLBACK_URL,
  DEFAULT_UPDATE_SOURCE_URL,
  PLUGIN_REPOSITORY_URL,
} from './constants.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const INSTALLED_PLUGIN_VERSION = packageJson.version;
/**
 * 自更新检查源与人工更新入口。
 *
 * 本仓库是「上海市审计科学研究所」维护的 dsh-auditor-mcp-connector 分支，
 * 不发布到 npm，所以版本以本仓库内该子目录的 package.json 为准（jsDelivr CDN），
 * 不再查询 registry.npmjs.org：若沿用 npm 身份，页面会把上游 0.2.x 当成
 * “可一键更新”，从而用上游包覆盖本分支。
 */
export const UPDATE_SOURCE_URL = DEFAULT_UPDATE_SOURCE_URL;
export const UPDATE_SOURCE_FALLBACK_URL = DEFAULT_UPDATE_SOURCE_FALLBACK_URL;
export const REPOSITORY_URL = PLUGIN_REPOSITORY_URL;
export const VERSION_CHECK_TTL_MS = 6 * 60 * 60 * 1000;
export const VERSION_CHECK_FAILURE_TTL_MS = 5 * 60 * 1000;

function normalizeVersion(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/^v/i, '');
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized
    : undefined;
}

function parseVersion(value) {
  const normalized = normalizeVersion(value);
  if (!normalized) return undefined;
  const [withoutBuild] = normalized.split('+');
  const [core, prerelease] = withoutBuild.split('-', 2);
  return {
    normalized,
    core: core.split('.').map(Number),
    prerelease: prerelease?.split('.') ?? [],
  };
}

/** Compare two semantic versions. Returns a positive number when `left` is newer. */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;
    const aNumeric = /^\d+$/.test(aPart);
    const bNumeric = /^\d+$/.test(bPart);
    if (aNumeric && bNumeric) return Number(aPart) - Number(bPart);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return aPart.localeCompare(bPart);
  }
  return 0;
}

export function isVersionNewer(candidate, installed) {
  return compareVersions(candidate, installed) > 0;
}

/**
 * 把一个自更新源地址归一为可直接 fetch 的 package.json URL。
 *
 * 兼容三种写法，便于在 `cordis.patch.yml` 里直接粘贴：
 *   1. GitHub 目录页 `https://github.com/<owner>/<repo>/tree/<ref>/<path…>`
 *   2. jsDelivr 目录 `https://cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/<path…>`
 *   3. 上述两种的 package.json 完整地址
 * 目录写法会自动补 `/package.json`；`@tree/<ref>` 这类 GitHub 写法会归一为 `@<ref>`。
 * @param value - 配置里的自更新源地址。
 * @returns 可 fetch 的 URL；空值或非法输入返回 undefined。
 */
export function resolveUpdateSourceUrl(value) {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim();
  if (raw === '') return undefined;
  const githubDir = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/tree\/([^/\s]+)\/?(.*)$/.exec(raw);
  const candidate = githubDir === null
    ? raw.replace(/@tree\//, '@')
    : `https://cdn.jsdelivr.net/gh/${githubDir[1]}/${githubDir[2]}@${githubDir[3]}/${githubDir[4] ?? ''}`;
  const trimmed = candidate.replace(/\/+$/, '');
  if (trimmed === '') return undefined;
  return /\.json$/i.test(trimmed) ? trimmed : `${trimmed}/package.json`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJson(fetchImpl, url, { timeoutMs, activeControllers }) {
  const controller = new AbortController();
  activeControllers.add(controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': `dsh-auditor-mcp-connector/${INSTALLED_PLUGIN_VERSION}`,
      },
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    activeControllers.delete(controller);
  }
}

/**
 * 从本仓库读取插件版本，判断是否有更新。
 *
 * CDN（jsDelivr）是版本权威；raw.githubusercontent 作为新鲜度回退：
 * 回退源已经更高、CDN 还没跟上时，说明 CDN 缓存尚未同步，页面提示等待同步，
 * 而不是谎报“可更新”。两个源都失败时明确返回 unavailable。
 */
export function createVersionStatusService({
  installedVersion = INSTALLED_PLUGIN_VERSION,
  updateSourceUrl = UPDATE_SOURCE_URL,
  updateSourceFallbackUrl = UPDATE_SOURCE_FALLBACK_URL,
  repositoryUrl = REPOSITORY_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  cacheTtlMs = VERSION_CHECK_TTL_MS,
  failureTtlMs = VERSION_CHECK_FAILURE_TTL_MS,
  now = () => Date.now(),
  logger,
} = {}) {
  const primaryUrl = resolveUpdateSourceUrl(updateSourceUrl);
  const fallbackUrl = resolveUpdateSourceUrl(updateSourceFallbackUrl);
  const usableFallback = fallbackUrl !== undefined && fallbackUrl !== primaryUrl ? fallbackUrl : undefined;
  let cached;
  let expiresAt = 0;
  let inFlight;
  const activeControllers = new Set();

  /** 所有结果共享的静态字段：检查目标、人工更新入口与未知态。 */
  function base(extra) {
    return {
      installedVersion,
      latestVersion: null,
      pendingVersion: null,
      updateAvailable: false,
      checking: false,
      status: 'unavailable',
      checkedAt: new Date(now()).toISOString(),
      nextCheckAt: null,
      updateSourceUrl: primaryUrl ?? null,
      repositoryUrl,
      sources: { cdn: { ok: false }, github: { ok: false } },
      ...extra,
    };
  }

  async function query() {
    const checkedAtMs = now();
    const [primaryResult, fallbackResult] = await Promise.allSettled([
      primaryUrl === undefined
        ? Promise.reject(new Error('自更新源未配置'))
        : fetchJson(fetchImpl, primaryUrl, { timeoutMs, activeControllers }),
      usableFallback === undefined
        ? Promise.reject(new Error('未配置回退源'))
        : fetchJson(fetchImpl, usableFallback, { timeoutMs, activeControllers }),
    ]);

    const cdnVersion = primaryResult.status === 'fulfilled'
      ? normalizeVersion(primaryResult.value?.version)
      : undefined;
    const githubVersion = fallbackResult.status === 'fulfilled'
      ? normalizeVersion(fallbackResult.value?.version)
      : undefined;
    const cdnOk = cdnVersion !== undefined;
    const githubOk = githubVersion !== undefined;
    const errors = [];
    if (!cdnOk) {
      errors.push(`CDN: ${primaryResult.status === 'rejected' ? errorMessage(primaryResult.reason) : '返回了无效版本'}`);
    }
    // 没配置回退源不算失败，也不告警。
    if (!githubOk && usableFallback !== undefined) {
      errors.push(`回退源: ${fallbackResult.status === 'rejected' ? errorMessage(fallbackResult.reason) : '返回了无效版本'}`);
    }
    if (errors.length > 0) logger?.warn?.(`plugin update check partial failure: ${errors.join('; ')}`);

    // 权威版本：CDN 优先；CDN 不可用时用回退源兜底，避免 CDN 故障导致查不到更新。
    const authoritative = cdnVersion ?? githubVersion;
    const updateAvailable = authoritative !== undefined && isVersionNewer(authoritative, installedVersion);
    // 回退源已发布、CDN 尚未跟上的版本：提示“正在同步”，不计入可更新。
    const pendingVersion = cdnVersion !== undefined && githubVersion !== undefined
      && isVersionNewer(githubVersion, cdnVersion) && isVersionNewer(githubVersion, installedVersion)
      ? githubVersion
      : null;
    const status = cdnOk
      ? (githubOk || usableFallback === undefined ? 'ok' : 'partial')
      : (githubOk ? 'partial' : 'unavailable');
    // CDN 失败时用短 TTL 重试；CDN 成功则按正常周期缓存，避免回退源的失败拖长重试。
    const resultTtlMs = cdnOk ? cacheTtlMs : failureTtlMs;
    const result = base({
      latestVersion: authoritative ?? null,
      pendingVersion,
      updateAvailable,
      status,
      checkedAt: new Date(checkedAtMs).toISOString(),
      nextCheckAt: new Date(checkedAtMs + resultTtlMs).toISOString(),
      sources: {
        cdn: cdnOk ? { ok: true, version: cdnVersion } : { ok: false },
        github: githubOk ? { ok: true, version: githubVersion } : { ok: false },
      },
    });
    expiresAt = checkedAtMs + resultTtlMs;
    cached = result;
    return result;
  }

  async function check({ force = false } = {}) {
    if (!force && cached && now() < expiresAt) return cached;
    if (inFlight) return inFlight;
    if (typeof fetchImpl !== 'function' || primaryUrl === undefined) {
      cached = base({ nextCheckAt: new Date(now() + failureTtlMs).toISOString() });
      expiresAt = now() + failureTtlMs;
      return cached;
    }
    inFlight = query().finally(() => { inFlight = undefined; });
    return inFlight;
  }

  function status({ force = false } = {}) {
    const stale = !cached || now() >= expiresAt;
    if ((force || stale) && !inFlight) {
      void check({ force: true }).catch((error) => {
        logger?.warn?.(`plugin update check failed: ${errorMessage(error)}`);
      });
    }
    const current = cached ?? base({ status: 'checking', checkedAt: null });
    return { ...current, checking: inFlight !== undefined };
  }

  function dispose() {
    for (const controller of activeControllers) controller.abort();
    activeControllers.clear();
  }

  return { status, check, dispose };
}
