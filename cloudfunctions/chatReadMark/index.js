// cloudfunctions/chatReadMark/index.js
// 标记会话已读：记录当前用户在该会话的已读时间戳
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const openid = String(cloud.getWXContext().OPENID || '').trim();
  if (!openid) return { ok: false };
  const convId = String(event.convId || '').trim();
  if (!convId) return { ok: false };
  try {
    const docId = `read__${openid}__${convId}`.slice(0, 180);
    const ref = db.collection('chat_read_state').doc(docId);
    const t = Date.now();
    const cur = await ref.get().catch(() => null);
    const prev = cur && cur.data ? Number(cur.data.lastReadAt || 0) : 0;
    if (prev >= t) return { ok: true };
    const data = { openid, convId, lastReadAt: t, updatedAt: t };
    if (cur && cur.data) {
      await ref.update({ data });
    } else {
      await ref.set({ data });
    }
    return { ok: true };
  } catch (e) {
    console.error('chatReadMark error', e);
    return { ok: false };
  }
};
