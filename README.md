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

## 停止条件

以下任一条件满足时停止：

1. **连续 N 次滚动到底部无新请求**（默认 5 次）— 核心！没有更多数据了
2. **滚动次数达到上限**（默认 50 次）— 保命用
3. **topic 时间早于时间范围**（默认 24 小时）

## 安装

```bash
npm install
```

## 配置

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

### 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `groupId` | (必填) | 知识星球星球 ID |
| `cdpPort` | 9222 | Chrome CDP 端口 |
| `scroll.waitAfterScroll` | 3000 | 滚动到底部后等待 API 完成 (ms) |
| `scroll.readWaitMin` | 10000 | 阅读等待最小时间 (ms) |
| `scroll.readWaitMax` | 20000 | 阅读等待最大时间 (ms) |
| `scroll.maxScrolls` | 50 | 最大滚动到底部次数 |
| `scroll.noNewRequestThreshold` | 5 | 连续 N 次无新请求时停止 |
| `fetch.maxTimeHours` | 24 | 抓取时间范围 (小时) |
| `fetch.urlPattern` | api.zsxq.com | 监听 URL 模式 |
| `output.outputDir` | /tmp/zsxq-fetched | JSON 文件输出目录 |

## 使用

```bash
# 默认使用 config.json
node src/index.js

# 指定配置文件
node src/index.js --config my-config.json
```

## Chrome 启动

确保 Chrome 已启动并开启远程调试：

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222
```

## 工作流程

```
1. 加载配置文件
2. 连接 Chrome CDP
3. 设置网络监听（监听 api.zsxq.com）
4. 打开知识星球页面（或使用已有标签页）
5. 滚动到页面底部
6. 等待 API 请求完成
7. 如果收到新 API 响应 → 触发阅读等待
8. 如果连续 N 次都没收到新响应 → 停止
9. 保存数据到 JSON 文件
```

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

## 依赖

- [chrome-remote-interface](https://www.npmjs.com/package/chrome-remote-interface) - CDP 客户端

## License

MIT
