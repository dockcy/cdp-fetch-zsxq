/**
 * 网络请求监听器
 * 基于 CDP 事件 + JavaScript 注入来获取响应体
 */

const { EventEmitter } = require('events');

/**
 * 创建网络请求监听器
 * 
 * @param {object} Network - CDP Network 域
 * @param {object} Runtime - CDP Runtime 域
 * @param {object} options - 过滤选项
 * @returns {EventEmitter}
 */
function createNetworkMonitor(Network, Runtime, options = {}) {
  const emitter = new EventEmitter();
  
  const {
    urlPattern = '',
    groupId = null,
    responseFilter = null
  } = options;
  
  const matchesUrl = (url) => {
    if (responseFilter && typeof responseFilter === 'function') {
      return responseFilter(url);
    }
    
    let match = url.includes(urlPattern);
    
    if (groupId) {
      match = match && url.includes(`/groups/${groupId}/topics`);
    }
    
    return match;
  };
  
  // 存储已见过的请求（去重）
  const seenRequests = new Set();
  
  console.log(`[Monitor] 开始监听: ${urlPattern}`);
  
  // 1. 请求即将发出
  Network.requestWillBeSent((params) => {
    const url = params.request.url;
    if (matchesUrl(url) && !seenRequests.has(url)) {
      seenRequests.add(url);
      console.log(`[Monitor] 检测到请求: ${url.substring(0, 80)}`);
      
      emitter.emit('request', {
        type: 'request',
        url,
        requestId: params.requestId,
        timestamp: params.timestamp,
        documentURL: params.documentURL
      });
    }
  });
  
  // 2. 收到响应 - 用 JS fetch 获取 body
  Network.responseReceived(async (params) => {
    const url = params.response.url;
    if (matchesUrl(url) && seenRequests.has(url)) {
      console.log(`[Monitor] 收到响应，获取数据...`);
      
      // 用 JS fetch 获取响应体（credentials: 'include' 会带上 cookie）
      const fetchScript = `
        fetch(${JSON.stringify(url)}, { credentials: 'include' })
          .then(resp => resp.text().then(text => ({ ok: resp.ok, status: resp.status, body: text })))
          .catch(e => ({ error: e.message }))
      `;
      
      try {
        const result = await Runtime.evaluate({
          expression: fetchScript,
          returnByValue: true,
          awaitPromise: true,
          timeout: 10000
        });
        
        if (result.result && result.result.value) {
          const data = result.result.value;
          if (data.error) {
            console.log(`[Monitor] fetch 失败: ${data.error}`);
          } else if (data.body) {
            emitter.emit('responseBody', {
              url,
              body: data.body
            });
          }
        }
      } catch (e) {
        console.error(`[Monitor] 获取响应失败: ${e.message}`);
      }
    }
  });
  
  // 3. loadingFinished（用于追踪请求完成）
  Network.loadingFinished((params) => {
    // 请求完成追踪，可用于调试
  });
  
  return {
    emitter,
    getSeenCount: () => seenRequests.size,
    clearSeen: () => {
      seenRequests.clear();
    }
  };
}

/**
 * 解析知识星球 API 响应
 */
function parseZsxqResponse(body) {
  try {
    const data = JSON.parse(body);
    if (data.resp_data && data.resp_data.topics) {
      return {
        topics: data.resp_data.topics,
        hasMore: data.resp_data.has_more || false,
        nextCursor: data.resp_data.cursor
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  createNetworkMonitor,
  parseZsxqResponse
};
