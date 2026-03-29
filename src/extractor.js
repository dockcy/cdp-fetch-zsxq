/**
 * 数据提取器
 * 从知识星球 API 响应中提取结构化数据
 */

/**
 * 从 topic 对象中提取需要的数据
 * @param {object} topic - 原始 topic 对象
 * @param {string} groupId - 星球 ID
 * @returns {object}
 */
function extractTopic(topic, groupId) {
  const talk = topic.talk || {};
  const owner = talk.owner || {};
  const group = topic.group || {};
  
  return {
    topic_id: String(topic.topic_id || topic.topic_uid || ''),
    group_id: String(groupId),
    create_time: topic.create_time || '',
    talk_text: talk.text || '',
    title: topic.title || extractTitle(topic),
    images: extractImages(topic),
    files: extractFiles(topic),
    audios: extractAudios(topic),
    origin_url: topic.topic_url || `https://wx.zsxq.com/topic/${topic.topic_id}`,
    _extra: {
      owner_name: owner.name || '',
      owner_alias: owner.alias || '',
      likes_count: topic.likes_count || 0,
      comments_count: topic.comments_count || 0,
      type: topic.type || 'unknown'
    }
  };
}

/**
 * 提取标题（如果没有显式标题，从正文中取前200字符）
 */
function extractTitle(topic) {
  if (topic.title) return topic.title;
  const talk = topic.talk || {};
  if (talk.text) {
    return talk.text.substring(0, 200);
  }
  return '';
}

/**
 * 提取图片列表
 */
function extractImages(topic) {
  const images = [];
  if (topic.talk) {
    if (topic.talk.images) {
      for (const img of topic.talk.images) {
        images.push({ url: img.url || img.src || '' });
      }
    }
    if (topic.talk.photos) {
      for (const photo of topic.talk.photos) {
        images.push({ url: photo.url || photo.src || '' });
      }
    }
  }
  return images;
}

/**
 * 提取文件列表
 */
function extractFiles(topic) {
  const files = [];
  if (topic.talk && topic.talk.files) {
    for (const file of topic.talk.files) {
      files.push({
        name: file.name || '',
        type: file.type || '',
        size: file.size || 0
      });
    }
  }
  return files;
}

/**
 * 提取音频列表
 */
function extractAudios(topic) {
  const audios = [];
  if (topic.talk && topic.talk.audios) {
    for (const audio of topic.talk.audios) {
      audios.push({
        url: audio.url || audio.src || '',
        duration: audio.duration || 0
      });
    }
  }
  return audios;
}

/**
 * 批量提取
 * @param {array} topics - topic 数组
 * @param {string} groupId - 星球 ID
 * @returns {array}
 */
function extractTopics(topics, groupId) {
  return topics.map(topic => extractTopic(topic, groupId));
}

/**
 * 去除重复 topic（根据 topic_id）
 * @param {array} topics
 * @returns {array}
 */
function deduplicateTopics(topics) {
  const seen = new Set();
  return topics.filter(topic => {
    if (seen.has(topic.topic_id)) {
      return false;
    }
    seen.add(topic.topic_id);
    return true;
  });
}

module.exports = {
  extractTopic,
  extractTopics,
  deduplicateTopics
};
