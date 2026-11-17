// cloudfunctions/chatConversations/index.js
// 我的会话列表：从服务端查询，附带每个会话的未读消息数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async () => {
  const openid = String(cloud.getWXContext().OPENID || '').trim();
  if (!openid) return { ok: false, list: [] };
  try {
    const res = await db.collection('chat_conversations')
      .where({ participants: _.all([openid]) })
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get()
      .catch(() => ({ data: [] }));
    const rows = res.data || [];

    // 读取本用户在各会话的已读时间
    const readRes = await db.collection('chat_read_state')
      .where({ openid })
      .limit(200)
      .get()
      .catch(() => ({ data: [] }));
    const readMap = {};
    (readRes.data || []).forEach(r => {
      const cid = String(r.convId || '').trim();
      const ts = Number(r.lastReadAt || 0);
      if (cid && ts > 0) readMap[cid] = ts;
    });

    // 计算未读数：对方发的、且晚于我已读时间的消息
    const list = [];
    for (const c of rows) {
      const cid = String(c.convId || '').trim();
      const readAt = readMap[cid] || 0;
      let unread = 0;
      if (cid) {
        const cnt = await db.collection('chat_messages').where({
          convId: cid,
          to: openid,
          createdAt: _.gt(readAt)
        }).count().catch(() => ({ total: 0 }));
        unread = cnt.total || 0;
      }
      const other = (c.participants || []).find(p => p !== openid) || '';
      list.push(Object.assign({}, c, {
        otherOpenid: other,
        otherName: (c.labels && c.labels[other]) || '对方',
        unread,
        lastTimeText: formatAgo(c.updatedAt)
      }));
    }
    list.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return { ok: true, list };
  } catch (e) {
    console.error('chatConversations error', e);
    return { ok: false, list: [] };
  }
};

function formatAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - Number(ts);
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + '分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + '小时前';
  if (d < 604800000) return Math.floor(d / 86400000) + '天前';
  const dt = new Date(Number(ts));
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
