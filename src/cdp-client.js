/**
 * CDP 连接管理
 * 负责连接到 Chrome CDP 端口
 */

const CDP = require('chrome-remote-interface');

const DEFAULT_PORT = 9222;

/**
 * 创建 CDP 客户端连接
 * @param {number} port - CDP 端口
 * @param {string|null} tabId - 指定标签页 ID（为空则创建新标签）
 * @returns {Promise<CDP.Client>}
 */
async function createClient(port = DEFAULT_PORT, tabId = null) {
  console.log(`[CDP] 连接到 Chrome (端口 ${port})...`);
  
  let client;
  
  if (tabId) {
    // 连接到指定标签页
    client = await CDP({ port, target: tabId });
    console.log(`[CDP] 已连接到标签页: ${tabId}`);
  } else {
    // 创建新客户端
    client = await CDP({ port });
    console.log(`[CDP] 连接成功`);
  }
  
  const { Page, Network, Runtime, Target } = client;
  
  // 启用所有必要的域
  await Promise.all([
    Page.enable(),
    Network.enable(),
    Runtime.enable(),
    Target.setDiscoverTargets({ discover: true })
  ]);
  
  console.log(`[CDP] Network/Page/Runtime 域已启用`);
  
  return {
    client,
    Page,
    Network,
    Runtime,
    Target
  };
}

/**
 * 获取标签页列表
 * @param {number} port
 * @returns {Promise<Array>}
 */
async function listTabs(port = DEFAULT_PORT) {
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => {
      req.destroy();
      resolve([]);
    });
  });
}

module.exports = {
  createClient,
  listTabs,
  DEFAULT_PORT
};
