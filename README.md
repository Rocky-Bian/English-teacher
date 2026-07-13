# Emma · AI 英语老师

Web 版英语学习助手，基于 DeepSeek 大模型。支持英语对话、中文纠错、布置与批改作业。

## 功能

- **对话练习**：和 Emma 用英语聊天，她会根据你的 CEFR 水平调整难度
- **中文纠错**：发现语法、词汇、拼写、表达问题时，用中文解释
- **情景模式**：约会软件、酒吧、面试、吵架和好、深夜语音、机场等角色扮演
- **语音朗读**：Edge TTS · JennyNeural（与 morning-news 同款），支持自动朗读
- **语音输入**：本地开发可用 Whisper；线上不配置 OpenAI 时先使用文字输入
- **布置作业**：对话中说 "Can you give me some homework?"，或在作业页手动生成
- **批改作业**：提交后 Emma 自动批改，给出中文反馈

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 DeepSeek API Key

复制环境变量模板并填入你的 Key：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```
DEEPSEEK_API_KEY=sk-xxxxxxxx
```

在 [DeepSeek 开放平台](https://platform.deepseek.com) 注册并创建 API Key。

### 4. 安装本地 Whisper（语音输入，一次性）

```bash
pip3 install -r requirements-whisper.txt
```

首次语音输入会自动下载 tiny.en 模型（约 75MB），之后本地转写，无需 OpenAI。

### 5. 启动开发服务器

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

### 6. 给手机访问

如果你想在 iPhone 或 Android 上打开这个项目，请使用局域网启动：

```bash
npm run dev:mobile
```

然后确保手机和 Mac 在同一个 Wi-Fi，下列两种方式都可用：

- Mac 浏览器打开：`http://localhost:3000`
- 手机浏览器打开：`http://你的Mac局域网IP:3000`

例如：

```text
http://192.168.2.122:3000
```

安装到手机主屏幕：

- iPhone：用 Safari 打开后，点“分享” -> “添加到主屏幕”
- Android：用 Chrome 打开后，点菜单 -> “添加到主屏幕”或“安装应用”

## 技术栈

- Next.js 16 + TypeScript + Tailwind CSS
- DeepSeek API（OpenAI 兼容格式）
- 本地 SQLite / 线上 Upstash Redis REST（存储对话、作业、学习记录）

## 外网和手机 App 化

项目现在支持两种运行模式：

- 本地开发：不配置远程存储时，继续使用 SQLite 和本地 Whisper。
- 线上部署：配置 Upstash Redis REST 后，数据会写入云端；不配置 `OPENAI_API_KEY` 时，线上先使用文字输入。

线上需要配置这些环境变量：

```text
DEEPSEEK_API_KEY=sk-...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Supabase 备用建表 SQL 仍保留在 [schema.sql](/Users/mac/Desktop/english-teacher/supabase/schema.sql:1)，以后如果要从 Upstash 换回 Supabase 可以继续用。

手机安装有两条路线：

- 轻量方式：部署后用 Safari / Chrome 打开公网网址，添加到主屏幕。
- 原生壳方式：用 Capacitor 把公网网址封装成 iOS / Android App，手机离开局域网后仍访问线上后端。

### 原生 App 壳

第一次已经生成好 `ios/` 和 `android/` 工程。拿到公网 HTTPS 地址后，先同步到原生工程：

```bash
CAPACITOR_SERVER_URL=https://your-production-url.example.com npm run app:sync
```

然后打开对应工程打包安装：

```bash
npm run app:ios
npm run app:android
```

iOS 需要 Xcode 和 Apple 开发者签名；Android 需要 Android Studio / SDK。

## 项目结构

```
src/
  app/api/          # API 路由
  components/       # UI 组件
  lib/
    deepseek.ts     # DeepSeek 客户端
    prompts.ts      # 老师 Prompt
    teacher.ts      # 对话 / 作业逻辑
    db.ts           # SQLite 数据库
    types.ts        # 类型定义
```

## 使用提示

- 在「设置」中调整 CEFR 等级（A1–C2）和昵称，开启自动朗读
- 聊天页顶部切换**情景模式**，Emma 会先开口抛台词
- 每条 Emma 消息可点 **🔊 朗读**（Jenny 神经语音）；底部可开 **自动朗读** 或 **🎤 语音输入**
- 语音输入首次使用会下载本地 Whisper 模型，需先 `pip3 install -r requirements-whisper.txt`
