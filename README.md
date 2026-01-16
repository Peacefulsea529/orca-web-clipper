# Orca Web Clipper

将网页内容剪藏到 Orca Note 的浏览器扩展。

## 项目结构

```
orca-web-clipper/
├── extension/          # 浏览器扩展 (Chrome/Edge)
│   ├── src/
│   │   ├── background/    # Service Worker
│   │   ├── content/       # 内容脚本
│   │   ├── popup/         # 弹出窗口 UI
│   │   └── shared/        # 共享工具和类型
│   ├── manifest.json
│   └── package.json
├── orca-plugin/        # Orca 插件 (接收剪藏内容，仅剪贴板模式需要)
│   ├── src/
│   │   ├── clipProcessor.ts # 剪藏处理逻辑
│   │   └── index.tsx      # 插件入口
│   └── package.json
└── plugin-docs/        # Orca 插件 API 文档
```

## 功能

- ✅ **MCP 直连模式**: 通过 MCP 协议直接保存到 Orca，无需手动粘贴
- ✅ **智能提取**: 自动提取文章主体内容，过滤广告和噪音
- ✅ **多种剪藏模式**: 文章模式、选中内容、全页保存
- ✅ **灵活保存位置**: 保存到今日日记或指定页面（已存在则追加，否则新建）
- ✅ **模板系统**: 内置多种模板（默认、文章、书签、研究笔记）
- ✅ **AI 智能优化**: 可选的 AI 内容清理和摘要生成
- ✅ **备注功能**: 添加个人笔记
- ✅ **Markdown 格式**: 内容以 Markdown 格式保存
- ✅ **自动标签**: 自动添加 #WebClip 等标签

## 安装

### 浏览器扩展

```bash
cd extension
npm install
npm run build
```

在 Chrome/Edge 中：
1. 打开 `chrome://extensions` 或 `edge://extensions`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extension/dist` 文件夹
   > **注意**：必须选择 `dist` 子文件夹，而不是项目根目录！

### 配置 MCP 直连（推荐）

1. 在 Orca 中打开 **设置 → 开发者 → MCP Server**
2. 复制 MCP Token
3. 在扩展设置中：
   - 勾选"启用 MCP 直连模式"
   - 粘贴 MCP Token
   - 仓库 ID 可留空（自动发现）
4. 点击"测试连接"确认成功

## 使用方法

### 剪藏页面

1. 在任意网页点击扩展图标
2. 选择剪藏模式：
   - **文章**: 智能提取主要内容（推荐）
   - **选中**: 仅剪藏选中的文本
   - **全页**: 保存完整页面
3. 选择保存位置：
   - **今日日记**: 添加到今天的日记页面
   - **页面**: 保存到指定页面（输入页面名称，已存在则追加，否则新建）
4. 可选：
   - 选择模板（默认、文章、书签、研究笔记）
   - 添加备注
   - 启用 AI 智能优化（需先配置 AI 设置）
5. 点击"剪藏到 Orca"

### 模板说明

| 模板 | 说明 | 标签 |
|------|------|------|
| 默认 | 简洁格式，标题+来源+内容 | #WebClip |
| 文章 | 完整元数据表格，适合长文 | #WebClip #Article |
| 书签 | 简短链接格式，适合收藏 | #WebClip #Bookmark |
| 研究笔记 | 包含 AI 摘要，适合研究 | #WebClip #Research |

### AI 智能优化（可选）

在设置中配置 AI 后，可在剪藏时启用：
- **智能提取**: 移除广告、导航等噪音内容
- **生成摘要**: 自动生成内容摘要（研究笔记模板自动启用）
- **增强格式**: 优化 Markdown 格式

支持的 AI 服务商：
- OpenAI
- Anthropic
- Google Gemini
- OpenRouter
- 自定义 API

## 通信模式

### MCP 直连模式（推荐）

扩展通过 MCP 协议直接与 Orca 通信，剪藏后内容自动保存。

### 剪贴板模式（备用）

如果 MCP 不可用，扩展会将内容复制到剪贴板，需要：
1. 安装 Orca 插件（`orca-plugin` 目录）
2. 在 Orca 中按 `Ctrl+Shift+V` 粘贴

## 模板变量

| 变量 | 说明 |
|------|------|
| `{{title}}` | 页面标题 |
| `{{url}}` | 页面 URL |
| `{{siteName}}` | 网站名称 |
| `{{author}}` | 作者 |
| `{{publishedAt}}` | 发布日期 |
| `{{capturedAt}}` | 剪藏时间 |
| `{{content}}` | 主要内容 (Markdown) |
| `{{note}}` | 用户备注 |
| `{{summary}}` | AI 生成摘要 |
| `{{date}}` | 当前日期 (YYYY-MM-DD) |
| `{{time}}` | 当前时间 (HH:mm) |

## 开发

### 浏览器扩展

```bash
cd extension
npm run watch  # 监听模式开发
npm run build  # 生产构建
```

### Orca 插件（仅剪贴板模式需要）

```bash
cd orca-plugin
npm run watch  # 监听模式开发
npm run build  # 生产构建
```

## 浏览器支持

- ✅ Chrome 100+
- ✅ Microsoft Edge 100+
- 🔄 Firefox (需要适配 Manifest V2)

## 许可证

MIT
