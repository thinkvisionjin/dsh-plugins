#!/usr/bin/env bash
# dsh-auditor-mcp-connector 一键安装脚本（DeepSeek Harness）
#
# 用法（先取得源码，再在插件目录内执行）：
#   git clone https://github.com/thinkvisionjin/dsh-plugins.git
#   cd dsh-plugins/dsh-auditor-mcp-connector
#   bash install.sh
#
# 也支持本地：bash install.sh（在插件目录内）。
# 支持：优先 dsh CLI（自动注册 bundle）；无 dsh 时回退 pnpm 并兜底注册 bundles。
# 幂等：重复执行不会重复注册或破坏已有配置。
# 说明：本插件为上海市审计科学研究所维护的内部分支，未发布到 npm，
#       因此安装源始终是当前源码目录，而不是 npm 上的同名包。
set -euo pipefail

PKG="dsh-auditor-mcp-connector"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${DSH_PROFILE:-web}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PJ="$PROFILE_DIR/package.json"

echo "==> 插件源码: $SRC_DIR"
echo "==> 目标 profile: $PROFILE_DIR"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "错误：profile 不存在：$PROFILE_DIR"
  echo "请确认 DSH_HOME 与 DSH_PROFILE（默认 ~/.dsh 与 web）。"
  exit 1
fi

if command -v dsh >/dev/null 2>&1; then
  echo "==> dsh plugin --profile $PROFILE add $SRC_DIR"
  dsh plugin --profile "$PROFILE" add "$SRC_DIR"
else
  if command -v pnpm >/dev/null 2>&1; then
    echo "==> 未找到 dsh CLI，回退 pnpm 安装（需自行确保 bundle 注册，见下）"
    (cd "$PROFILE_DIR" && pnpm add "$SRC_DIR")
  else
    echo "错误：未找到 dsh 或 pnpm，无法安装。请先安装 DeepSeek Harness。"
    exit 1
  fi
fi

if [ -f "$PJ" ]; then
  NEED=$(python3 - "$PJ" "$PKG" <<'PY' 2>/dev/null || echo "1"
import json, sys
d = json.load(open(sys.argv[1]))
print("0" if sys.argv[2] in d.get("dsh", {}).get("profile", {}).get("bundles", []) else "1")
PY
)
  if [ "$NEED" = "1" ]; then
    echo "==> 注册 bundle：$PKG"
    python3 - "$PJ" "$PKG" <<'PY'
import json, sys
p, pkg = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d.setdefault("dsh", {}).setdefault("profile", {}).setdefault("bundles", []).append(pkg)
json.dump(d, open(p, "w"), indent=2)
print("已添加", pkg)
PY
  else
    echo "==> bundle 已注册"
  fi
else
  echo "警告：未找到 $PJ，请确认 profile 完整。"
fi

echo
echo "✅ 安装完成！最后一步：重启 DeepSeek Harness（停止后重新运行 dsh web）。"
echo "   重启后点击左侧栏「面板图标菜单」里的 🧩 MCP连接器，即在主内容区打开整页。"
echo "   详见：https://github.com/thinkvisionjin/dsh-plugins"
