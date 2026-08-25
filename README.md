# MiniMax Token Usage

桌面置顶小工具，实时显示 **MiniMax Token Plan（原 Coding Plan）** 的使用量。

本项目纯 Vibe Coding，OpenCode + MiniMax自己玩的，原汤化原食说是。

> Token Plan 是 MiniMax 推出的订阅制套餐，前身是 Coding Plan。该工具使用 MiniMax 官方 API `/v1/token_plan/remains` 每分钟查询一次使用量。

## 功能

- 📊 三个维度展示：
  - **5h 限额**（5 小时滚动窗口）
  - **周限额**（按周滚动窗口）
  - **视频赠送**（视频生成配额）
- ⏰ 每分钟自动刷新一次
- 📌 窗口始终置顶，可在屏幕上任意拖动
- 🔐 API Key 通过 Electron `safeStorage` 在本机加密存储（Windows DPAPI / macOS Keychain）
- 🪟 关闭窗口后最小化到托盘，不退出进程
- 🌍 支持全球版（api.minimax.io）和中国版（api.minimaxi.com）

## 截图所示 UI

```
┌───────────────────────────────────────────────────────────┐
│ ● MiniMax Token Plan                            ↻ ⚙ ×   │
├───────────────────────────────────────────────────────────┤
│  5h 限额                              总额度 100%        │
│  24 分钟后重置                          已用 2%           │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                           │
│  周限额                              总额度 100%          │
│  5 天 9 小时后重置                    已用 0%             │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│                                                           │
│  视频赠送                            0 / 3 已用          │
│  9 小时 24 分后重置                                       │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
├───────────────────────────────────────────────────────────┤
│ 上次更新: 0 分 25 秒前                       立即刷新     │
└───────────────────────────────────────────────────────────┘
```

## 技术栈

- **Electron** - 桌面框架，支持置顶窗口、托盘、safeStorage
- **Vue 3** - 前端框架（Composition API）
- **Vite** - 构建工具
- **官方 API** - `GET https://www.minimax.io/v1/token_plan/remains`

## 快速开始

### 1. 安装依赖

```bash
cd minimax-token
npm install
```

### 2. 开发模式（带热重载）

```bash
npm run dev
```

该命令会同时启动 Vite 开发服务器（端口 5174）和 Electron 窗口。

### 3. 直接运行（生产模式）

```bash
npm run build
npm start
```

### 4. 打包发布

```bash
# Windows 安装包 (.exe)
npm run package:win

# macOS 安装包 (.dmg)
npm run package:mac

# Windows 干净构建（先清掉 electron-builder 缓存，再打包）
npm run package:win:clean

# 仅清缓存
npm run clean:builder-cache
```

打包产物在 `dist/` 目录下（如 `dist/MiniMax Token Usage Setup 1.0.0.exe`、`dist/MiniMax Token Usage-1.0.0-arm64.dmg`）。

### 5. 自动发布到 GitHub Releases

项目自带 `.github/workflows/release.yml`，支持两种触发方式：

**① Tag 推送 → 自动构建并发布 Release**

```bash
git tag v1.0.0
git push origin v1.0.0
```

Windows + macOS 并行构建，`electron-builder` 把 `.exe` / `.dmg` 上传到同名 Release。

**② Actions 页面手动触发 → 只构建，不发布**

在 GitHub 仓库页 → Actions → Release → Run workflow。产物会作为 workflow artifact 上传，从 `Artifacts` 区域下载，不污染 Release 列表。常用于本地不方便构建时验证打包链路。

- macOS 没配置 Apple Developer ID，构建出的 DMG 是未签名/未公证的，安装时需要在「系统设置 → 隐私与安全性」点「仍要打开」绕过 Gatekeeper
- Windows 没配置代码签名证书，SmartScreen 会提示「未知发布者」
- 任一目标失败不影响另一个（`fail-fast: false`），失败的那边的产物仍会作为 workflow artifact 兜底

> ⚠️ **Windows 打包踩坑**：`electron-builder` 会解压 `winCodeSign` 包，里面带了 darwin 的 `libcrypto.dylib` / `libssl.dylib` 软链接。7za 在标准用户权限下无法创建符号链接，会报：
>
> ```
> ERROR: Cannot create symbolic link : 客户端没有所需的特权
> ```
>
> 一次性解决，二选一：
>
> - **开 Windows 开发者模式**：设置 → 隐私和安全 → 开发者选项 → 打开「开发人员模式」
> - **用管理员身份运行 PowerShell/cmd** 后再执行 `npm run package:win`
>
> 如果之前已留下损坏的缓存目录，先跑 `npm run clean:builder-cache` 或 `npm run package:win:clean` 清掉再重试。

## 使用方法

1. 启动应用后会自动打开设置面板。
2. 登录 [platform.minimax.io](https://platform.minimax.io/user-center/payment/token-plan)，在 **Account → Token Plan** 页面找到 **Subscription Key**（类似 `eyJhbGciOi...`）。
3. 把 Subscription Key 粘贴到设置中，点击保存。
4. 应用会立即拉取一次使用量，之后每分钟自动更新。

## 目录结构

```
minimax-token/
├── electron/
│   ├── main.js          # Electron 主进程（窗口、托盘、safeStorage）
│   └── preload.js       # contextBridge 暴露 IPC 给渲染层
├── src/
│   ├── App.vue          # 主组件（进度条 UI）
│   ├── main.js          # Vue 入口
│   ├── api/
│   │   └── quota.js     # 封装官方 token_plan/remains 接口
│   ├── components/
│   │   └── SettingsModal.vue   # API Key 设置面板
│   └── styles.css       # 全局样式
├── index.html           # Vite 入口 HTML
├── vite.config.js
└── package.json
```

## 关键接口说明

应用通过 `GET /v1/token_plan/remains` 接口获取实时使用量数据，响应结构示例：

```json
{
  "model_remains": [
    {
      "model_name": "MiniMax-M3",
      "current_interval_total_count": 100,
      "current_interval_usage_count": 2,
      "remains_time": 1491,
      "current_interval_status": 1,
      "current_weekly_total_count": 500,
      "current_weekly_usage_count": 4,
      "weekly_remains_time": 524160,
      "current_weekly_status": 1
    }
  ]
}
```

字段含义：

- `current_interval_total_count` / `current_interval_usage_count` - 5 小时窗口总额度 / 已用额度
- `current_weekly_total_count` / `current_weekly_usage_count` - 周窗口总额度 / 已用额度
- `remains_time` / `weekly_remains_time` - 剩余秒数
- `current_interval_status` - 1=正常 2=耗尽 3=无限

## 常见问题

**Q: API Key 应该是哪个？**
A: 使用 Token Plan 的 **Subscription Key**，不是 pay-as-you-go 的 API Key。访问 [platform.minimax.io/user-center/payment/token-plan](https://platform.minimax.io/user-center/payment/token-plan) 查看。

**Q: 应用一直显示 "请先在设置中填入 API Key"？**
A: 点击右上角 ⚙ 打开设置，填入正确的 Subscription Key 后保存即可。

**Q: 点击 × 按钮后应用去哪了？**
A: 应用会最小化到系统托盘（屏幕右下角 / 菜单栏）。右键托盘图标可以退出。

**Q: 国内用户怎么配置？**
A: 在设置中将 API 域名切换为 `https://www.minimaxi.com`，对应中国版平台。

## License

MIT
