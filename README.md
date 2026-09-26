# dsh-plugins

上海市审计科学研究所维护的 DeepSeek Harness（DSH）插件集合。

## 插件

| 插件 | 说明 | 版本 |
| --- | --- | --- |
| [`dsh-auditor-mcp-connector`](dsh-auditor-mcp-connector/) | MCP连接器：接入、授权并管理外部 MCP Server，在主内容区整页浏览连接器目录、连接状态与工具清单 | 0.0.1 |

## 安装

```bash
git clone https://github.com/thinkvisionjin/dsh-plugins.git
cd dsh-plugins/dsh-auditor-mcp-connector
bash install.sh
```

安装后重启 DeepSeek Harness：左侧栏「面板图标菜单」会出现 🧩 MCP连接器，点击即在主内容区打开整页（不再是弹窗）。

## 目录约定

每个插件是仓库下的一个子目录，目录内自带 `package.json`、`cordis.patch.yml`（DSH bundle patch）与 `lib/client.js`（浏览器半区）。

## 来源与许可

`dsh-auditor-mcp-connector` 基于上游开源项目 [duhu2000/dsh-mcp-connector](https://github.com/duhu2000/dsh-mcp-connector)（MIT）分支改造，各插件目录内保留原 `LICENSE` 与署名。
