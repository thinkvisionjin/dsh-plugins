/**
 * MCP连接器插件 - 常量定义
 */
export const PLUGIN_NAME = 'mcp-connector';

/** 通用 OAuth 默认 scope */
export const DEFAULT_SCOPE = 'mcp:tools';

/** 默认账号标识（预留多账号） */
export const DEFAULT_ACCOUNT = 'default';

/** 自定义 / JSON 导入连接的 connectorId 占位 */
export const CUSTOM_CONNECTOR_ID = '__custom__';
export const JSON_CONNECTOR_ID = '__json__';

/** 保留 id 前缀：社区 PR 注册表拒绝占用 */
export const RESERVED_ID_PREFIXES = ['qcc-', 'dsh-', 'mcp-connector-'];

/** 远程 registry 主目录源（jsDelivr CDN，国内网络更稳定） */
export const DEFAULT_CATALOG_URL =
  'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json';

/** 默认目录源失败时依次尝试；仅用于未自定义 catalogUrl 的配置。 */
export const DEFAULT_CATALOG_FALLBACK_URLS = [
  'https://raw.githubusercontent.com/duhu2000/dsh-mcp-connector-registry/main/catalog.json',
];

/**
 * 本插件自身的源码位置（上海市审计科学研究所维护分支）。
 * 本插件不发布到 npm，「检查更新」以本仓库为准，而不是上游 npm 包。
 */
export const PLUGIN_REPOSITORY_URL =
  'https://github.com/thinkvisionjin/dsh-plugins/tree/main/dsh-auditor-mcp-connector';

/**
 * 自更新检查源：本仓库内该插件 package.json 的 jsDelivr 地址。
 * jsDelivr 的写法是 `gh/<owner>/<repo>@<ref>/<path>`；GitHub 目录页写法
 * `github.com/<owner>/<repo>/tree/<ref>/<path>` 也会被识别（见 version-status.js）。
 */
export const DEFAULT_UPDATE_SOURCE_URL =
  'https://cdn.jsdelivr.net/gh/thinkvisionjin/dsh-plugins@main/dsh-auditor-mcp-connector/package.json';

/** 自更新回退源：raw.githubusercontent 始终最新，用于识别 CDN 缓存尚未同步的版本。 */
export const DEFAULT_UPDATE_SOURCE_FALLBACK_URL =
  'https://raw.githubusercontent.com/thinkvisionjin/dsh-plugins/main/dsh-auditor-mcp-connector/package.json';

/** 请求 / 刷新默认值 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** 首次启动 MCP Server 并完成 initialize + tools/list 的最长等待时间 */
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
export const DEFAULT_REFRESH_SKEW_MS = 300_000;
/** OAuth 刷新暂时失败后的指数退避范围。 */
export const DEFAULT_REFRESH_RETRY_BASE_MS = 30_000;
export const DEFAULT_REFRESH_RETRY_MAX_MS = 300_000;
export const DEFAULT_CATALOG_TTL_MS = 3_600_000;

/** PKCE 约束（RFC 7636） */
export const VERIFIER_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~-';
export const VERIFIER_MIN_LENGTH = 43;
export const VERIFIER_MAX_LENGTH = 128;

/** MCP Streamable HTTP 探测用的协议版本 */
export const MCP_PROTOCOL_VERSION = '2025-03-26';
