# AGENTS.md

## 项目类型
单包 Electron 桌面应用，渲染层用 Vue 3 + Vite，主进程纯 Node。**只构建 Windows**。

## 入口
- 主进程：`electron/main.js`
- 渲染入口：`index.html` → `src/main.js` → `src/App.vue`
- IPC 桥：`electron/preload.js`
- Vite root = 仓库根目录（`vite.config.js:22`），`base: './'` 走 `file://`

## 命令
| 用途 | 命令 |
|---|---|
| 开发（Vite + Electron 热重载） | `npm run dev` |
| 仅 Vite | `npm run dev:vite` |
| 渲染层构建 | `npm run build` |
| 跑打包后的应用 | `npm start` |
| 打 Windows 安装包 | `npm run package:win` |
| 清缓存后再打 | `npm run package:win:clean` |
| 仅清缓存 | `npm run clean:builder-cache` |

`npm run dev` 走 `scripts/dev.js`：先在 `5174–5274` 找一个空闲端口，spawn Vite，等 HTTP 就绪后再 spawn Electron。端口冲突会自动顺延，不要手动指定。

## postinstall 自动跑两个脚本（不可删）
- `scripts/fix-electron-path.js`：去掉 `node_modules/electron/path.txt` 的 CRLF，否则 Windows 下 Electron 找不到二进制
- `scripts/build-tray-icon.js`：手写 32×32 PNG → `build/tray-icon.png`，无依赖

## 重要约束
- **没有 lint、typecheck、test 脚本**。`package.json` 里完全没有。改动后只能靠 `npm run build` 验证 Vite 能过。
- **`build/` 整个目录在 `.gitignore` 里**（包括 `icon.ico`、`tray-icon.png`）。`npm install` 会通过 `postinstall` 重新生成托盘图标；`icon.ico` 由 `electron-builder` 首次打包时下载。**不要把 `build/` 里的东西 commit 进去**。
- **Windows 打包常见坑**：`winCodeSign` 包里带 darwin 软链接，普通用户权限 7za 会报 `Cannot create symbolic link`。二选一：
  1. 开 Windows 开发者模式
  2. 用管理员 PowerShell 跑
  3. 或先跑 `npm run clean:builder-cache` 清掉损坏缓存再重试
- **代码签名**：未配置。安装时 SmartScreen 会提示「未知发布者」，CI 里 `CSC_IDENTITY_AUTO_DISCOVERY: false`。
- **API Key 存储**：用 Electron `safeStorage`（Windows DPAPI），存在 `userData/config.json`。打包态默认走 Electron 默认的 `%APPDATA%\<app-name>\`，**NSIS 升级不会动这个目录，配置跨升级保留**。如果需要便携模式，在 `.exe` 同目录放一个空的 `portable.flag` 文件即可启用，配置会跟 `.exe` 一起（注意：升级会被替换，请自行备份）。见 `electron/main.js:8-15`。

## 目录约定
- `electron/` 主进程，**不要** import `src/` 里的 Vue 组件
- `src/api/quota.js` 封装 MiniMax 官方 `/v1/token_plan/remains` 接口
- `src/components/SettingsModal.vue` 设置面板
- `scripts/` 全是 Node 脚本，跟 Electron 主进程同等环境跑

## 发布（`.github/workflows/release.yml`）
- **触发 1**：`git tag v* && git push origin v*` → 自动构建并发布到 GitHub Releases
- **触发 2**：Actions 页面手动 Run workflow → 默认只上传到当次 run 的 Artifacts，要进 Releases 必须勾上 `publish=true`
- 产物：`win-installer-win.zip`（NSIS .exe）+ `win-portable-win.zip`（`win-unpacked/`）
- 用 `bash` shell 显式执行（Windows runner 默认 PowerShell 不认 `[ ... ]`）

## 别做的事
- 不要加 macOS 构建配置（已明确移除）
- 不要 commit `node_modules/`、`dist/`、`build/`、`.port`（开发期 Vite 写入的端口号文件）
- 不要引入测试框架/linter/typechecker——项目刻意保持零配置，加之前先问用户
- 不要把 `.env*`、`*.pem`、API key 等凭证 commit 进去（已在 `.gitignore` 防御）