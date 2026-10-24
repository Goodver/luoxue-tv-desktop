# 洛雪影视导航 · Windows 桌面版

手机版（`com.luoxue.tv`）的 Windows 桌面版本。Electron 构建，纯沉浸式影视站点导航：渐变状态标签（绿=可访问 / 红=不可访问）、可用性检测、远程数据更新、右键置顶收藏、点击卡片全屏直达站点（无地址栏、无浏览器 UI）。

## 功能

- **单窗口架构**：整个应用始终保持一个窗口——导航页与站点页共用，进站 = 窗口内加载站点；任何弹窗/新窗口链接都在当前窗口打开，绝不产生第二个窗口
- **导航窗口**：应用程序默认窗口大小（1600×950，可调），无菜单栏、无浏览器 UI
- **返回键**：进站页面左上角悬浮"← 返回"按钮（鼠标悬浮高亮），或按 Esc —— 返回**站内上一个页面**（网页历史后退），无上一页时切回导航页
- **可用性检测**：每个站点带渐变圆形状态标签——绿 = 可访问，红 = 不可访问（检测中灰色闪烁）
- **远程数据更新**：点"检测更新"从本仓库 `resources/resources.json` 拉取最新站点清单，写入本地缓存；失败自动保留旧清单。更新站点只需改仓库 JSON，用户端无需升级
- **置顶收藏**：右键卡片置顶 / 取消（★ 标识），置顶站点独立分区，本地持久化
- **桌面 UA**：进站使用桌面浏览器 UA（Windows Edge / Chrome 135），站点按桌面版渲染

## 运行与构建

环境要求：Node.js 18+

```bash
# 安装依赖
npm install

# 开发运行
npm start

# 打包 Windows 安装包 + 免安装版（产物在 dist/）
npm run build
```

## 产物

`dist/` 目录下生成：
- `洛雪影视导航-1.0.0-x64.exe` —— NSIS 安装包
- `洛雪影视导航-1.0.0-x64-portable.exe` —— 免安装便携版

## 目录结构

```
desktop/
├── main.js          # 主进程：窗口管理、可用性检测、远程数据拉取
├── preload.js       # 安全桥接（contextBridge IPC）
├── nav.html/css/js  # 导航页 UI
├── resources.json   # 内置站点清单（与手机版一致）
└── package.json
```

## 数据与免责声明

- 站点清单数据来源：本仓库 [resources/resources.json](../resources/resources.json)，源自 [awesome-zhuiju-free](https://github.com/laoma528/awesome-zhuiju-free)（仅取 online_video 分类）
- 本应用仅为导航入口，不托管、不存储任何影视内容；站点的可用性与内容由各站点自行负责
- 请勿轻易相信或点击站点上的广告
