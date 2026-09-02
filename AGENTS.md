# AGENTS.md

## 项目类型
单包 Electron 桌面应用，渲染层用 Vue 3 + Vite，主进程纯 Node。**构建 Windows + Linux**（AppImage + tar.gz）。**不构建 macOS**（已明确移除）。

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
| 清缓存后再打 Windows | `npm run package:win:clean` |
| 打 Linux 包（AppImage + tar.gz） | `npm run package:linux` |
| 清缓存后再打 Linux | `npm run package:linux:clean` |
| 仅清缓存 | `npm run clean:builder-cache` |

`npm run dev` 走 `scripts/dev.js`：先在 `5174–5274` 找一个空闲端口，spawn Vite，等 HTTP 就绪后再 spawn Electron。端口冲突会自动顺延，不要手动指定。

## postinstall 自动跑两个脚本（不可删）
- `scripts/fix-electron-path.js`：去掉 `node_modules/electron/path.txt` 的 CRLF，否则 Windows 下 Electron 找不到二进制（Linux 上是 no-op）
- `scripts/build-tray-icon.js`：手写两张 PNG → `build/tray-icon.png`（32×32，托盘用）+ `build/icon.png`（256×256，Linux 应用图标）。零依赖

## 重要约束
- **没有 lint、typecheck、test 脚本**。`package.json` 里完全没有。改动后只能靠 `npm run build` 验证 Vite 能过。
- **`build/` 整个目录在 `.gitignore` 里**（包括 `icon.ico`、`tray-icon.png`、`icon.png`）。`npm install` 会通过 `postinstall` 重新生成图标；`icon.ico` 由 `electron-builder` 首次打包 Windows 时下载。**不要把 `build/` 里的东西 commit 进去**。
- **Windows 打包常见坑**：`winCodeSign` 包里带 darwin 软链接，普通用户权限 7za 会报 `Cannot create symbolic link`。二选一：
  1. 开 Windows 开发者模式
  2. 用管理员 PowerShell 跑
  3. 或先跑 `npm run clean:builder-cache` 清掉损坏缓存再重试
- **Linux 打包常见坑**：
  - 需要 `icon.png` ≥ 256×256（postinstall 已生成）
  - 在 Ubuntu runner 上 `tar.gz` 会自动附带；AppImage 不需要额外工具
  - 想打 `pacman` 包需要额外 `pacman` 工具链；当前没配
- **代码签名**：未配置。Windows 安装时 SmartScreen 会提示「未知发布者」；Linux AppImage 首次运行要右键→属性→勾「允许执行」或 `chmod +x`。CI 里 `CSC_IDENTITY_AUTO_DISCOVERY: false`。
- **API Key 存储**：用 Electron `safeStorage`（Windows DPAPI / Linux libsecret / macOS Keychain），存在 `userData/config.json`。
  - Windows：默认 `%APPDATA%\<app-name>\`，**NSIS 升级不会动这里，配置跨升级保留**。便携模式在 `.exe` 同目录放 `portable.flag` 即可（升级会被替换，请备份）。
  - Linux：默认 `~/.config/<app-name>/`，**AppImage 升级不会覆盖这里**。AppImage 走 FUSE 挂载，便携模式不适用。
  - 见 `electron/main.js:8-21`。

## Linux / Wayland 适配要点
- **Wayland 检测**：`scripts/dev.js` 在 `XDG_SESSION_TYPE=wayland` 时自动设置 `ELECTRON_OZONE_PLATFORM_HINT=wayland`。X11 会话不设置（保持自动检测）。
- **托盘**：Electron 33 默认走 StatusNotifierItem 协议。Wayland 合成器需要外部 tray daemon 显示：
  - **Niri**（你用的）：需要 `snixembed` 或类似 daemon：`yay -S snixembed-git` 后在 `~/.config/niri/init.kdl` 或 systemd 启动
  - Hyprland：自带 tray 支持（`exec-once = snixembed`）
  - Sway：自带 bar tray 支持
  - KDE / GNOME：自带
  - 没 daemon 跑着 → 托盘图标创建不会报错，但不会显示
- **safeStorage on Linux**：需要 `libsecret`（Arch: `sudo pacman -S libsecret`）。未安装时 `safeStorage.isEncryptionAvailable()` 返回 `false`，代码已自动降级到明文（`apiKeyPlain` 字段），能用就是不加密。安装后第一次写入会自动加密。
- **窗口置顶**：`setAlwaysOnTop(true, 'floating')` 在 Wayland 下生效（Niri 中是真正的 floating 层）；但 Wayland 不允许某些几何调整，保存 bounds 失败是正常现象，代码会 swallow。
- **截图 / Frameless / 透明**：均支持。
- **CI**：`.github/workflows/release.yml` 已经加 `ubuntu-latest` runner，产物为 `linux-appimage-linux` + `linux-tarball-linux` 两个 Artifact（tag push / publish=true 时进 Release）。

## 目录约定
- `electron/` 主进程，**不要** import `src/` 里的 Vue 组件
- `src/api/quota.js` 封装 MiniMax 官方 `/v1/token_plan/remains` 接口
- `src/components/SettingsModal.vue` 设置面板
- `scripts/` 全是 Node 脚本，跟 Electron 主进程同等环境跑

## 发布（`.github/workflows/release.yml`）
- **触发 1**：`git tag v* && git push origin v*` → 自动构建并发布到 GitHub Releases
- **触发 2**：Actions 页面手动 Run workflow → 默认只上传到当次 run 的 Artifacts，要进 Releases 必须勾上 `publish=true`
- 矩阵：`win` + `linux`
- 产物：
  - Windows：`win-installer-win.zip`（NSIS .exe）+ `win-portable-win.zip`（`win-unpacked/`）
  - Linux：`linux-appimage-linux.zip`（`*.AppImage` + `latest-linux.yml`）+ `linux-tarball-linux.zip`（`*.tar.gz`）
- 用 `bash` shell 显式执行（Windows runner 默认 PowerShell 不认 `[ ... ]`）

## 别做的事
- 不要加 macOS 构建配置（已明确移除）
- 不要 commit `node_modules/`、`dist/`、`build/`、`.port`（开发期 Vite 写入的端口号文件）
- 不要引入测试框架/linter/typechecker——项目刻意保持零配置，加之前先问用户
- 不要把 `.env*`、`*.pem`、API key 等凭证 commit 进去（已在 `.gitignore` 防御）