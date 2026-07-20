# AniList · 动漫风追番备忘录

> 🎌 纯前端、动漫风格的追番 / 追剧 / 电影备忘单页应用

![Screenshot](screenshot.png)

## 功能特性

- ✅ **条目管理** — 浏览、添加、编辑、删除番剧/剧集/电影记录
- 🔍 **搜索筛选** — 按标题搜索，按类型和状态筛选
- 📊 **统计栏** — 一眼看清各状态的数量
- ⭐ **星星评分** — 直观的 5 星评分
- 🌙 **暗色动漫风 UI** — 紫色霓虹 + 粒子动画背景
- 📱 **响应式布局** — 手机单列、平板双列、桌面三/四列
- 💾 **本地存储** — 数据保存在浏览器 localStorage，关页不丢失
- 📦 **导入导出** — JSON 格式备份与恢复数据

## 在线演示

👉 [https://wmx778899.github.io/jiju](https://wmx778899.github.io/jiju)

## 部署到 GitHub Pages

### Settings 配置

1. 进入仓库 **Settings → Pages**
2. Source 选择 **Deploy from a branch**
3. Branch 选择 `main`，目录选 `/ (root)`
4. 点击 Save

等待 1-2 分钟后访问 `https://wmx778899.github.io/jiju`

## 本地运行

直接在浏览器打开 `index.html` 即可使用，无需任何构建工具。

```bash
# 或者使用本地服务器
npx serve .
```

## 项目结构

```
anilist/
├── index.html          # 入口页面
├── css/
│   └── style.css       # 全部样式（暗色动漫风）
├── js/
│   ├── storage.js       # 数据存储层（封装 localStorage）
│   └── app.js           # 应用逻辑（渲染、交互、事件）
├── README.md
└── screenshot.png      # 截图
```

## 技术栈

- 原生 HTML5 / CSS3 / Vanilla JavaScript
- Google Fonts — Noto Sans SC + Zen Dots
- Font Awesome 图标库
- Canvas 粒子动画背景
- localStorage 数据持久化
- 无任何框架依赖

## License

MIT
