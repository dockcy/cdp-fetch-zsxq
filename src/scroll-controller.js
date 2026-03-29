/**
 * 滚动控制器
 * 模拟人类滚动行为：滚动到底部 → 检测新 API 请求 → 等待阅读 → 继续滚动到底部
 * 
 * 核心逻辑：
 * 1. 滚动到底部（不是逐步滚动）
 * 2. 等待 N 秒（让 API 请求完成）
 * 3. 如果有收到新请求，触发阅读等待
 * 4. 如果连续 N 次滚动到底部都没有新请求，停止（没更多数据了）
 */

const { EventEmitter } = require('events');

/**
 * 创建滚动控制器
 * @param {object} Runtime - CDP Runtime 域
 * @param {object} options - 配置选项
 */
function createScrollController(Runtime, options = {}) {
  const emitter = new EventEmitter();
  
  const {
    scrollInterval = 3000,        // 滚动到底部后等待时间 (ms)
    readWaitMin = 10000,          // 阅读等待最小时间 (ms) 
    readWaitMax = 20000,          // 阅读等待最大时间 (ms)
    maxScrolls = 50,             // 最大滚动到底部次数
    noNewRequestThreshold = 5    // 连续 N 次无新请求时停止
  } = options;
  
  let isScrolling = false;
  let shouldStop = false;
  let scrollCount = 0;
  let consecutiveNoNewRequestCount = 0;
  
  /**
   * 随机等待一段时间（模拟人类思考/阅读）
   */
  function randomReadWait() {
    const waitTime = Math.floor(Math.random() * (readWaitMax - readWaitMin)) + readWaitMin;
    console.log(`[Scroll] 阅读等待 ${waitTime / 1000} 秒...`);
    return new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  /**
   * 滚动到页面底部
   */
  async function scrollToBottom() {
    try {
      // 先滚动到当前可见的位置，然后等待滚动完成
      await Runtime.evaluate({
        expression: `window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })`
      });
      
      // 等待滚动完成
      await new Promise(r => setTimeout(r, 500));
      
      // 获取页面高度
      const heightInfo = await Runtime.evaluate({
        expression: `
          ({
            scrollHeight: document.body.scrollHeight,
            scrollY: window.scrollY,
            clientHeight: window.innerHeight
          })
        `
      });
      
      return heightInfo.result.value;
    } catch (e) {
      console.error(`[Scroll] 滚动错误:`, e.message);
      return null;
    }
  }
  
  /**
   * 执行一次滚动到底部
   */
  async function doScrollToBottom() {
    if (isScrolling || shouldStop) return;
    
    isScrolling = true;
    scrollCount++;
    
    try {
      console.log(`[Scroll] 第 ${scrollCount} 次滚动到底部...`);
      
      // 滚动到底部
      const info = await scrollToBottom();
      
      if (info) {
        console.log(`[Scroll] 页面高度: ${info.scrollHeight}, 滚动位置: ${info.scrollY}`);
      }
      
    } catch (e) {
      console.error(`[Scroll] 错误:`, e.message);
    } finally {
      isScrolling = false;
    }
  }
  
  /**
   * 开始自动滚动（滚动到底部模式）
   */
  async function startAutoScroll() {
    console.log(`[Scroll] 开始滚动到底部模式`);
    console.log(`[Scroll] 停止条件: 连续 ${noNewRequestThreshold} 次无新请求 或 达到 ${maxScrolls} 次`);
    shouldStop = false;
    scrollCount = 0;
    consecutiveNoNewRequestCount = 0;
    
    while (!shouldStop && scrollCount < maxScrolls) {
      await doScrollToBottom();
      
      if (shouldStop) break;
      
      // 滚动到底部后，等待一段时间让 API 请求完成
      console.log(`[Scroll] 等待 ${scrollInterval}ms 让 API 请求完成...`);
      await new Promise(r => setTimeout(r, scrollInterval));
      
      // 检查是否因为无新请求而应该停止
      if (consecutiveNoNewRequestCount >= noNewRequestThreshold) {
        console.log(`[Scroll] 连续 ${consecutiveNoNewRequestCount} 次无新请求，停止`);
        emitter.emit('noNewRequestStop');
        break;
      }
    }
    
    if (scrollCount >= maxScrolls) {
      console.log(`[Scroll] 达到最大滚动次数 ${maxScrolls}`);
      emitter.emit('maxScrollsReached');
    }
  }
  
  /**
   * 通知发现了新数据（收到新的 API 响应）
   * 调用这个会重置无新请求计数，并触发阅读等待
   */
  async function onNewDataDiscovered() {
    consecutiveNoNewRequestCount = 0;  // 重置计数
    console.log(`[Scroll] 检测到新数据，重置无新请求计数`);
    
    // 触发阅读等待
    emitter.emit('readingStarted');
    await randomReadWait();
    emitter.emit('readingFinished');
  }
  
  /**
   * 通知一次滚动结束但没有新数据
   * 累计无新请求次数
   */
  function onScrollNoNewData() {
    consecutiveNoNewRequestCount++;
    console.log(`[Scroll] 本次滚动无新数据 (${consecutiveNoNewRequestCount}/${noNewRequestThreshold})`);
  }
  
  /**
   * 停止滚动
   */
  function stop() {
    console.log(`[Scroll] 停止滚动`);
    shouldStop = true;
  }
  
  return {
    emitter,
    startAutoScroll,
    stop,
    onNewDataDiscovered,
    onScrollNoNewData,
    getScrollCount: () => scrollCount,
    getConsecutiveNoNewRequestCount: () => consecutiveNoNewRequestCount,
    isRunning: () => !shouldStop
  };
}

module.exports = {
  createScrollController
};
