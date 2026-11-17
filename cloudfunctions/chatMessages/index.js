// cloudfunctions/chatMessages/index.js
// 拉取会话消息：仅会话参与者可读，支持分页
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const openid = String(cloud.getWXContext().OPENID || '').trim();
  if (!openid) return { ok: false, list: [] };
  const convId = String(event.convId || '').trim();
  const before = Number(event.before || 0); // 时间戳游标，拉取更早的消息
  const size = Math.min(Number(event.size) || 30, 50);
  if (!convId) return { ok: false, list: [] };

  try {
    // 权限：当前用户必须是对话参与者
    const convRes = await db.collection('chat_conversations')
      .where({ convId })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const conv = convRes.data && convRes.data[0];
    if (!conv || (conv.participants || []).indexOf(openid) === -1) {
      return { ok: false, list: [] };
    }

    const where = { convId };
    if (before > 0) where.createdAt = db.command.lt(before);
    const res = await db.collection('chat_messages')
      .where(where)
      .orderBy('createdAt', 'desc')
      .limit(size)
      .get()
      .catch(() => ({ data: [] }));
    const list = (res.data || []).map(m => Object.assign({}, m, {
      mine: m.from === openid,
      timeText: formatTime(m.createdAt)
    }));
    return { ok: true, list, hasMore: list.length >= size };
  } catch (e) {
    console.error('chatMessages error', e);
    return { ok: false, list: [] };
  }
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
