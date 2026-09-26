import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPOSITORY_URL,
  UPDATE_SOURCE_FALLBACK_URL,
  UPDATE_SOURCE_URL,
  compareVersions,
  createVersionStatusService,
  isVersionNewer,
  resolveUpdateSourceUrl,
} from '../lib/version-status.js';

function jsonResponse(value, { ok = true, status = 200 } = {}) {
  return { ok, status, async json() { return value; } };
}

test('语义版本比较支持 v 前缀、预发布版和构建元数据', () => {
  assert.ok(compareVersions('v0.2.24', '0.2.23') > 0);
  assert.ok(compareVersions('0.2.23', '0.2.23-rc.1') > 0);
  assert.ok(compareVersions('0.2.23-rc.2', '0.2.23-rc.1') > 0);
  assert.equal(compareVersions('0.2.23+build.2', '0.2.23+build.1'), 0);
  assert.equal(isVersionNewer('invalid', '0.2.23'), false);
});

test('自更新源默认指向本插件仓库，而不是 npm 上游包', () => {
  assert.match(UPDATE_SOURCE_URL, /^https:\/\/cdn\.jsdelivr\.net\/gh\/thinkvisionjin\/dsh-plugins@main\//);
  assert.match(UPDATE_SOURCE_URL, /dsh-auditor-mcp-connector\/package\.json$/);
  assert.match(UPDATE_SOURCE_FALLBACK_URL, /^https:\/\/raw\.githubusercontent\.com\/thinkvisionjin\/dsh-plugins\/main\//);
  assert.match(REPOSITORY_URL, /^https:\/\/github\.com\/thinkvisionjin\/dsh-plugins/);
  assert.doesNotMatch(UPDATE_SOURCE_URL, /registry\.npmjs\.org|dsh-mcp-connector@/);
});

test('自更新源地址归一化：GitHub 目录页、jsDelivr 目录与完整 URL', () => {
  const expected = 'https://cdn.jsdelivr.net/gh/thinkvisionjin/dsh-plugins@main/dsh-auditor-mcp-connector/package.json';
  assert.equal(
    resolveUpdateSourceUrl('https://github.com/thinkvisionjin/dsh-plugins/tree/main/dsh-auditor-mcp-connector'),
    expected,
  );
  assert.equal(
    resolveUpdateSourceUrl('https://cdn.jsdelivr.net/gh/thinkvisionjin/dsh-plugins@main/dsh-auditor-mcp-connector'),
    expected,
  );
  // jsDelivr 常见误写 @tree/<ref> 也能识别
  assert.equal(
    resolveUpdateSourceUrl('https://cdn.jsdelivr.net/gh/thinkvisionjin/dsh-plugins@tree/main/dsh-auditor-mcp-connector'),
    expected,
  );
  assert.equal(resolveUpdateSourceUrl(expected), expected);
  assert.equal(resolveUpdateSourceUrl(''), undefined);
  assert.equal(resolveUpdateSourceUrl(undefined), undefined);
});

test('CDN 上的 package.json 决定可更新版本，raw 回退源提供新鲜度', async () => {
  let calls = 0;
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    fetchImpl: async (url) => {
      calls += 1;
      if (url === UPDATE_SOURCE_URL) return jsonResponse({ name: 'dsh-auditor-mcp-connector', version: '0.0.2' });
      if (url === UPDATE_SOURCE_FALLBACK_URL) return jsonResponse({ version: '0.0.2' });
      throw new Error(`unexpected URL: ${url}`);
    },
  });

  const status = await service.check();
  assert.equal(status.installedVersion, '0.0.1');
  assert.equal(status.latestVersion, '0.0.2');
  assert.equal(status.updateAvailable, true);
  assert.equal(status.pendingVersion, null);
  assert.equal(status.status, 'ok');
  assert.equal(status.repositoryUrl, REPOSITORY_URL);
  assert.equal(status.updateSourceUrl, UPDATE_SOURCE_URL);

  assert.equal(await service.check(), status, '缓存期内应复用同一结果');
  assert.equal(calls, 2);
  await service.check({ force: true });
  assert.equal(calls, 4, '强制检查应跳过缓存');
  service.dispose();
});

test('状态接口立即返回本机版本，外部检查在后台完成', async () => {
  let releaseFetch;
  const gate = new Promise((resolve) => { releaseFetch = resolve; });
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    fetchImpl: async () => {
      await gate;
      return jsonResponse({ version: '0.0.2' });
    },
  });
  const immediate = service.status();
  assert.equal(immediate.installedVersion, '0.0.1');
  assert.equal(immediate.checking, true);
  assert.equal(immediate.latestVersion, null);
  assert.equal(immediate.repositoryUrl, REPOSITORY_URL);
  releaseFetch();
  const completed = await service.check();
  assert.equal(completed.updateAvailable, true);
  assert.equal(service.status().checking, false);
});

test('仓库已发布但 CDN 未跟上时只显示同步中，不允许更新', async () => {
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    fetchImpl: async (url) => url === UPDATE_SOURCE_URL
      ? jsonResponse({ version: '0.0.1' })
      : jsonResponse({ version: '0.0.2' }),
  });
  const status = await service.check();
  assert.equal(status.updateAvailable, false);
  assert.equal(status.pendingVersion, '0.0.2');
  assert.equal(status.latestVersion, '0.0.1');
});

test('CDN 可用但回退源受限时仍按六小时缓存，避免频繁重试', async () => {
  const checkedAt = Date.parse('2026-08-26T00:00:00Z');
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    now: () => checkedAt,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    failureTtlMs: 5 * 60 * 1000,
    fetchImpl: async (url) => {
      if (url === UPDATE_SOURCE_URL) return jsonResponse({ version: '0.0.2' });
      throw new Error('rate limited');
    },
  });
  const status = await service.check();
  assert.equal(status.status, 'partial');
  assert.equal(status.updateAvailable, true);
  assert.equal(Date.parse(status.nextCheckAt) - checkedAt, 6 * 60 * 60 * 1000);
});

test('CDN 不可用时用回退源兜底，仍能发现新版本', async () => {
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    fetchImpl: async (url) => {
      if (url === UPDATE_SOURCE_URL) throw new Error('cdn down');
      return jsonResponse({ version: '0.0.3' });
    },
  });
  const status = await service.check();
  assert.equal(status.status, 'partial');
  assert.equal(status.latestVersion, '0.0.3');
  assert.equal(status.updateAvailable, true);
  assert.equal(status.sources.cdn.ok, false);
  assert.equal(status.sources.github.ok, true);
});

test('版本源均不可用时仍返回本地安装版本', async () => {
  const warnings = [];
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    fetchImpl: async () => { throw new Error('offline'); },
    logger: { warn(message) { warnings.push(message); } },
  });
  const status = await service.check();
  assert.equal(status.installedVersion, '0.0.1');
  assert.equal(status.latestVersion, null);
  assert.equal(status.updateAvailable, false);
  assert.equal(status.status, 'unavailable');
  assert.equal(warnings.length, 1);
});

test('可以通过配置覆盖自更新源（cordis.patch.yml 的 updateSourceUrl）', async () => {
  const custom = 'https://example.test/dsh-auditor-mcp-connector/package.json';
  const seen = [];
  const service = createVersionStatusService({
    installedVersion: '0.0.1',
    updateSourceUrl: 'https://example.test/dsh-auditor-mcp-connector',
    updateSourceFallbackUrl: '',
    fetchImpl: async (url) => {
      seen.push(url);
      return jsonResponse({ version: '0.0.5' });
    },
  });
  const status = await service.check();
  assert.deepEqual(seen, [custom]);
  assert.equal(status.updateSourceUrl, custom);
  assert.equal(status.latestVersion, '0.0.5');
  assert.equal(status.status, 'ok', '未配置回退源不算部分失败');
});
