# zsxq-scroll-monitor

基于 CDP 的知识星球滚动抓取工具，模拟人类阅读行为。

## 核心思想

```
Chrome 浏览器 (用户已登录)
       ↑
       │ CDP 协议 (事件推送)
       │
  ┌────┴────┐
  │  监听 API 请求  │ ← 滚动到底部 → 触发新请求 → 被捕获
  └────┬────┘
       │
       ↓
  ┌─────────────────────┐
  │  停止滚动 N 秒      │ ← 模拟阅读等待行为
  │  (readWaitMin-Max)  │
  └─────────────────────┘
       │
       ↓
  ┌─────────────────────┐
  │  继续滚动到到底部   │ ← 重复
  └─────────────────────┘
       │
       ↓
  连续 N 次无新请求 → 停止（没有更多数据了）
```

## 特性

- **滚动到底部**：每次滚动到页面底部，触发知识星球的"加载更多"
- **事件驱动**：使用 CDP `Network.responseReceived` 事件推送，无需轮询
- **人类行为模拟**：检测到新数据 → 停止等待阅读 → 继续滚动
- **智能停止**：连续 N 次滚动到底部无新请求时自动停止
- **纯 JSON 输出**：抓取结果保存为 JSON 文件，不涉及数据库

## 安装

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Chrome 浏览器

#### Linux (Ubuntu/Debian)

```bash
# 方法一：直接安装
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# 方法二：下载 deb 包
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt-get install -f  # 修复依赖问题
```

#### Linux (CentOS/RHEL)

```bash
sudo yum install -y google-chrome-stable
```

#### macOS

```bash
# 使用 Homebrew
brew install --cask google-chrome

# 或者下载安装包
# https://www.google.com/chrome/
```

#### Windows

```powershell
# 使用 Chocolatey
choco install googlechrome -y

# 或者下载安装包
# https://www.google.com/chrome/
```

### 3. 启动 Chrome 并开启 CDP

#### Linux/macOS

```bash
google-chrome --remote-debugging-port=9222
# 或指定其他端口
google-chrome --remote-debugging-port=9123
```

#### Windows

```powershell
chrome.exe --remote-debugging-port=9222
```

### 4. 配置 config.json

编辑 `config.json`：

```json
{
  "groupId": "YOUR_GROUP_ID",
  "cdpPort": 9222,
  
  "scroll": {
    "waitAfterScroll": 3000,
    "readWaitMin": 10000,
    "readWaitMax": 20000,
    "maxScrolls": 50,
    "noNewRequestThreshold": 3
  },
  
  "fetch": {
    "urlPattern": "api.zsxq.com",
    "maxTimeHours": 48
  },
  
  "output": {
    "saveToFile": true,
    "outputDir": "./output"
  }
}
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `groupId` | (必填) | 知识星球星球 ID |
| `cdpPort` | 9222 | Chrome CDP 端口 |

## 使用

```bash
# 默认使用 config.json
node src/index.js

# 指定配置文件
node src/index.js --config my-config.json
```

## 停止条件

以下任一条件满足时停止：

1. **连续 N 次滚动到底部无新请求**（默认 3 次）— 核心！没有更多数据了
2. **滚动次数达到上限**（默认 50 次）— 保命用
3. **topic 时间早于时间范围**（默认 48 小时）

## 常见问题

### Q: 提示 "No inspectable targets"

Chrome 未启动或 CDP 端口配置错误。请确保：
1. Chrome 已启动并开启调试端口
2. `config.json` 中的 `cdpPort` 与启动 Chrome 时的端口一致

### Q: 如何查看 Chrome 是否开启了 CDP？

```bash
curl http://127.0.0.1:9222/json/version
```

如果返回 JSON，说明 Chrome CDP 已正确开启。

### Q: 已有登录的知识星球标签页

如果 Chrome 已打开知识星球并登录，脚本会自动复用该标签页，无需重新登录。

## 输出格式

```json
{
  "fetchedAt": "2026-03-29T11:00:00.000Z",
  "groupId": "28855458518111",
  "count": 20,
  "topics": [
    {
      "topic_id": "55188454282258884",
      "group_id": "28855458518111",
      "create_time": "2026-03-29T10:30:00.000+08:00",
      "talk_text": "内容...",
      "title": "标题",
      "images": [],
      "files": [],
      "audios": [],
      "origin_url": "https://wx.zsxq.com/topic/55188454282258884",
      "_extra": {
        "owner_name": "用户名",
        "owner_alias": "别名",
        "likes_count": 10,
        "comments_count": 5
      }
    }
  ]
}
```

## License

MIT
