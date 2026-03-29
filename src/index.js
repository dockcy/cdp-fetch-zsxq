/**
 * 知识星球滚动抓取主程序
 * 
 * 核心思想：
 * 1. 通过 CDP 连接 Chrome，监听网络请求（事件推送，非轮询）
 * 2. 模拟人类滚动行为：滚动到底部 → 检测到新 API 请求 → 停止等待阅读 → 继续滚动
 * 3. 当连续 N 次滚动都没有新 API 请求时，停止（说明没有更多数据了）
 * 4. 从监听到的 API 响应中提取数据，保存到临时 JSON 文件
 * 
 * 使用方式:
 *   node src/index.js --config config.json
 */

const fs = require('fs');
const path = require('path');

const { createClient, listTabs, DEFAULT_PORT } = require('./cdp-client');
const { createNetworkMonitor, parseZsxqResponse } = require('./network-monitor');
const { createScrollController } = require('./scroll-controller');
const { extractTopics } = require('./extractor');

// ============ 配置加载 ============
/**
 * 加载配置文件
 */
function loadConfig(configPath) {
  if (configPath && fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  }
  
  // 默认配置文件
  const defaultPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(defaultPath)) {
    const content = fs.readFileSync(defaultPath, 'utf8');
    return JSON.parse(content);
  }
  
  // 返回默认配置
  return {
    groupId: '28855458518111',
    cdpPort: 9222,
    scroll: {
      waitAfterScroll: 3000,
      readWaitMin: 10000,
      readWaitMax: 20000,
      maxScrolls: 50,
      noNewRequestThreshold: 5
    },
    fetch: {
      urlPattern: 'api.zsxq.com',
      maxTimeHours: 24
    },
    output: {
      saveToFile: true,
      outputDir: '/tmp/zsxq-fetched'
    }
  };
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let configPath = null;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' || args[i] === '-c') {
      configPath = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  
  return loadConfig(configPath);
}

function printHelp() {
  console.log(`
知识星球滚动抓取工具

用法:
  node src/index.js [选项]

选项:
  --config, -c <path>   配置文件路径 (默认: ./config.json)
  --help, -h           显示此帮助信息

配置文件格式 (config.json):
  {
    "groupId": "28855458518111",    // 星球 ID
    "cdpPort": 9222,                // CDP 端口
    "scroll": {
      "waitAfterScroll": 3000,      // 滚动后等待 (ms)
      "readWaitMin": 10000,        // 阅读等待最小 (ms)
      "readWaitMax": 20000,        // 阅读等待最大 (ms)
      "maxScrolls": 50,            // 最大滚动次数
      "noNewRequestThreshold": 5    // 连续 N 次无新请求时停止
    },
    "fetch": {
      "urlPattern": "api.zsxq.com", // 监听 URL 模式
      "maxTimeHours": 24            // 抓取时间范围
    },
    "output": {
      "saveToFile": true,           // 保存到临时文件
      "outputDir": "/tmp/zsxq-fetched"
    }
  }
`);
}

/**
 * 保存到 JSON 文件
 */
function saveToJsonFile(topics, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const filePath = path.join(outputDir, `zsxq_fetched_${timestamp}.json`);
  
  // 保存原始响应结构和提取的数据
  const data = {
    fetchedAt: new Date().toISOString(),
    groupId: topics[0]?.group_id || '',
    count: topics.length,
    topics: topics
  };
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`[File] 已保存到: ${filePath}`);
  
  return filePath;
}

/**
 * 主程序
 */
async function main() {
  const config = parseArgs();
  
  console.log('='.repeat(50));
  console.log('知识星球滚动抓取工具');
  console.log('='.repeat(50));
  console.log('配置:');
  console.log(`  星球 ID: ${config.groupId}`);
  console.log(`  CDP 端口: ${config.cdpPort || DEFAULT_PORT}`);
  console.log(`  滚动间隔: ${config.scroll.waitAfterScroll}ms`);
  console.log(`  阅读等待: ${config.scroll.readWaitMin}-${config.scroll.readWaitMax}ms`);
  console.log(`  最大滚动: ${config.scroll.maxScrolls} 次`);
  console.log(`  无新请求停止: 连续 ${config.scroll.noNewRequestThreshold} 次`);
  console.log(`  时间范围: ${config.fetch.maxTimeHours} 小时`);
  console.log('='.repeat(50));
  
  const { groupId, cdpPort, scroll, fetch: fetchConfig, output } = config;
  const port = cdpPort || DEFAULT_PORT;
  
  // 1. 连接到 CDP
  console.log('\n[步骤 1] 连接 CDP...');
  
  let client;
  try {
    // 先列出所有标签页，找已有的 zsxq 页面
    console.log('[步骤 1a] 检查已有标签页...');
    const tabs = await listTabs(port);
    const existingTab = tabs.find(tab => tab.url && tab.url.includes('zsxq.com'));
    
    if (existingTab) {
      console.log(`[步骤 1b] 找到已有标签页: ${existingTab.id} - ${existingTab.title}`);
      const cdp = await createClient(port, existingTab.id);
      client = cdp.client;
    } else {
      console.log(`[步骤 1b] 未找到已有标签页，将打开新页面`);
      const cdp = await createClient(port);
      client = cdp.client;
    }
    
    const { Page, Network, Runtime } = client;
    console.log('[CDP] 连接成功！');
  } catch (e) {
    console.error('\n' + '='.repeat(50));
    console.error('[错误] 无法连接到 Chrome CDP');
    console.error('='.repeat(50));
    console.error('\n请确保：');
    console.error('1. Chrome 已启动并开启了远程调试端口');
    console.error('2. CDP 端口配置正确（当前配置: ' + port + '）');
    console.error('\n启动 Chrome 的命令：');
    console.error('  Linux:   google-chrome --remote-debugging-port=' + port);
    console.error('  macOS:   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=' + port);
    console.error('  Windows: chrome.exe --remote-debugging-port=' + port);
    console.error('\n详细说明请参考 README.md');
    console.error('='.repeat(50));
    process.exit(1);
  }
  
  // 2. 创建网络监听器
  console.log('\n[步骤 2] 设置网络监听...');
  const { emitter: netEmitter } = createNetworkMonitor(Network, Runtime, {
    urlPattern: fetchConfig.urlPattern,
    groupId: groupId
  });
  
  // 3. 数据收集
  const discoveredTopics = [];
  const cutoffTime = new Date(Date.now() - fetchConfig.maxTimeHours * 60 * 60 * 1000);
  let hasNewDataSinceLastScroll = false;
  let lastScrollCount = 0;
  let consecutiveOldDataCount = 0;  // 连续多少次滚动抓到的都是过期数据
  let lastLoggedDate = null;  // 上一次打印的日期
  
  // 监听网络响应
  netEmitter.on('responseBody', async (data) => {
    const parsed = parseZsxqResponse(data.body);
    if (parsed && parsed.topics) {
      console.log(`[Network] 解析到 ${parsed.topics.length} 条 topics`);
      
      const extracted = extractTopics(parsed.topics, groupId);
      let hasValidTopic = false;  // 是否有有效期内的新数据
      
      for (const topic of extracted) {
        // 检查是否超过时间范围
        if (new Date(topic.create_time) < cutoffTime) {
          // 打印最新发现的过期日期
          const topicDate = new Date(topic.create_time).toISOString().substring(0, 10);
          if (topicDate !== lastLoggedDate) {
            lastLoggedDate = topicDate;
            console.log(`[Network] 发现数据日期: ${topicDate} (超过 ${fetchConfig.maxTimeHours}h 范围)`);
          }
          continue;
        }
        
        hasValidTopic = true;
        hasNewDataSinceLastScroll = true;  // 只有有效数据才算新数据
        // 避免重复
        if (!discoveredTopics.find(t => t.topic_id === topic.topic_id)) {
          discoveredTopics.push(topic);
          console.log(`[Network] ✅ 新增有效 topic: ${topic.topic_id} (${topic.create_time.substring(0, 10)})`);
        }
      }
      
      // 如果没有有效期内数据，计入过期数据计数
      if (!hasValidTopic) {
        consecutiveOldDataCount++;
        console.log(`[Network] 第 ${consecutiveOldDataCount} 次抓到的都是过期数据`);
      } else {
        consecutiveOldDataCount = 0;
      }
      
      // 有有效数据，触发阅读等待
      if (hasValidTopic && scrollController.isRunning()) {
        scrollController.onNewDataDiscovered();
      }
    }
  });
  
  // 4. 创建滚动控制器
  console.log('\n[步骤 3] 启动滚动控制器...');
  const scrollController = createScrollController(Runtime, {
    scrollInterval: scroll.waitAfterScroll || 3000,
    readWaitMin: scroll.readWaitMin,
    readWaitMax: scroll.readWaitMax,
    maxScrolls: scroll.maxScrolls,
    noNewRequestThreshold: scroll.noNewRequestThreshold || 5
  });
  
  scrollController.emitter.on('noNewRequestStop', () => {
    console.log('[Scroll] 停止原因: 连续无新请求');
  });
  
  scrollController.emitter.on('maxScrollsReached', () => {
    console.log('[Scroll] 停止原因: 达到最大滚动次数');
  });
  
  // 5. 导航到目标页面（只有没有找到已有标签页时才导航）
  if (existingTab) {
    console.log('\n[步骤 4] 使用已有登录页面');
    console.log('[Page] 刷新页面获取最新数据...');
    await Page.reload();  // 刷新页面
    await new Promise(r => setTimeout(r, 5000));  // 等待刷新完成
  } else {
    console.log('\n[步骤 4] 打开知识星球页面...');
    await Page.navigate({ url: `https://wx.zsxq.com/group/${groupId}` });
    console.log('[Page] 等待页面加载...');
    await new Promise(r => setTimeout(r, 6000));
  }
  
  // 6. 开始滚动
  console.log('\n[步骤 5] 开始自动滚动...');
  console.log(`[Info] 监听 ${fetchConfig.urlPattern} 的 API 请求`);
  console.log('[Info] 检测到新请求时将触发阅读等待');
  
  // 定期检查是否收到新数据
  const dataCheckInterval = setInterval(() => {
    if (scrollController.getScrollCount() > lastScrollCount) {
      lastScrollCount = scrollController.getScrollCount();
      
      // 重置标志
      hasNewDataSinceLastScroll = false;
      
      // 延迟检查是否收到新数据
      setTimeout(() => {
        if (!hasNewDataSinceLastScroll && scrollController.isRunning()) {
          scrollController.onScrollNoNewData();
        }
        
        // 检查是否连续多次抓到的都是过期数据（停止条件）
        if (consecutiveOldDataCount >= 3 && scrollController.isRunning()) {
          console.log('\n' + '='.repeat(50));
          console.log(`[终止原因] 连续 ${consecutiveOldDataCount} 次抓到的都是过期数据`);
          console.log(`[终止原因] 已超过设定时间范围: ${fetchConfig.maxTimeHours}h`);
          console.log('='.repeat(50));
          scrollController.stop();
        }
      }, (scroll.waitAfterScroll || 3000) + 2000);
    }
  }, 500);
  
  // 启动滚动（异步）
  scrollController.startAutoScroll().then(() => {
    console.log('[Scroll] 滚动结束');
  });
  
  // 等待滚动完成或被停止
  await new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (!scrollController.isRunning()) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 1000);
  });
  
  // 7. 保存数据
  console.log('\n[步骤 6] 保存数据...');
  console.log(`[Data] 共收集到 ${discoveredTopics.length} 条 topics`);
  
  if (discoveredTopics.length > 0) {
    // 按时间排序（新的在前）
    discoveredTopics.sort((a, b) => new Date(b.create_time) - new Date(a.create_time));
    
    // 保存到临时文件
    if (output.saveToFile) {
      saveToJsonFile(discoveredTopics, output.outputDir || '/tmp/zsxq-fetched');
    }
    
    // 打印摘要
    console.log('\n' + '='.repeat(50));
    console.log('抓取摘要');
    console.log('='.repeat(50));
    console.log(`总条数: ${discoveredTopics.length}`);
    console.log(`最新: ${discoveredTopics[0]?.create_time}`);
    console.log(`最早: ${discoveredTopics[discoveredTopics.length - 1]?.create_time}`);
    console.log('='.repeat(50));
  } else {
    console.log('[Data] 没有收集到新数据');
  }
  
  // 8. 清理
  console.log('\n[Cleanup] 关闭连接...');
  clearInterval(dataCheckInterval);
  await client.close();
  
  console.log('\n完成!');
}

/**
 * 错误处理
 */
process.on('unhandledRejection', (e) => {
  console.error('[Error] 未处理的错误:', e);
  process.exit(1);
});

main().catch(e => {
  console.error('[Fatal]', e);
  process.exit(1);
});
