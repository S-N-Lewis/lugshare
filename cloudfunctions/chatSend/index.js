// cloudfunctions/chatSend/index.js
// 发送消息 + 会话 upsert。权限：仅"带货人 ↔ 本行程报名者"可互发
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 会话 ID：由 tripId + 两个 openid 排序拼接，保证双方落在同一会话
function convIdOf(tripId, a, b) {
  const x = a < b ? a : b;
  const y = a < b ? b : a;
  return `conv__${tripId}__${x}__${y}`;
}
function docIdOf(convId) {
  return convId.length <= 64 ? convId : `conv_${crypto.createHash('md5').update(convId).digest('hex')}`;
}
function ok(data) { return { ok: true, data }; }
function fail(msg) { return { ok: false, msg }; }

// 内容安全；未开通时降级放行（本地敏感逻辑由前端 + 云端词库兜底）
async function secCheck(text) {
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content: text, version: 2 });
    if (res && res.result && res.result.suggest === 'risky') return '内容含违规信息，请修改后再发';
  } catch (e) {
    console.warn('msgSecCheck 不可用，降级放行', e && e.errCode);
  }
  return null;
}

exports.main = async (event) => {
  const from = String(cloud.getWXContext().OPENID || '').trim();
  if (!from) return fail('请先登录');
  const tripId = String(event.tripId || '').trim();
  const to = String(event.toOpenid || '').trim();
  const text = String(event.text || '').trim().slice(0, 500);
  if (!tripId || !to || !text) return fail('参数错误');
  if (to === from) return fail('不能给自己发消息');

  const secErr = await secCheck(text);
  if (secErr) return fail(secErr);

  try {
    const tripRes = await db.collection('trips').doc(tripId).get().catch(() => null);
    const trip = tripRes && tripRes.data;
    if (!trip) return fail('行程不存在');
    const owner = String(trip.openid || '').trim();

    // 权限：对方必须是行程发布者，或本行程的报名者；且自己也必须是其中一个
    const isOwner = from === owner;
    let isApplicant = false;
    if (!isOwner) {
      const app = await db.collection('demands')
        .where({ tripId, openid: from, status: _.nin(['rejected', 'cancelled']) })
        .count().catch(() => ({ total: 0 }));
      isApplicant = app.total > 0;
    }
    if (!isOwner && !isApplicant) return fail('仅行程相关用户可聊天');
    // 校验接收方确实是行程相关的另一方
    const toIsOwner = to === owner;
    let toIsApplicant = false;
    if (!toIsOwner) {
      const app2 = await db.collection('demands')
        .where({ tripId, openid: to, status: _.nin(['rejected', 'cancelled']) })
        .count().catch(() => ({ total: 0 }));
      toIsApplicant = app2.total > 0;
    }
    if (!toIsOwner && !toIsApplicant) return fail('对方不是该行程的相关用户');

    // 取双方昵称（从 users 表）
    const names = {};
    const us = await db.collection('users').where({ openid: _.in([from, to]) }).limit(2).get().catch(() => ({ data: [] }));
    (us.data || []).forEach(u => { names[u.openid] = u.nickName || '匿名用户'; });

    const convId = convIdOf(tripId, from, to);
    const convDocId = docIdOf(convId);
    const t = Date.now();
    const labels = {};
    labels[from] = names[from] || '我';
    labels[to] = names[to] || '对方';

    // upsert 会话（兼容新旧基础库：先 get 再决定 set/update，避免 doc().set 覆盖语的语义差异）
    const convRef = db.collection('chat_conversations').doc(convDocId);
    const cur = await convRef.get().catch(() => null);
    const convData = {
      convId, tripId,
      tripRoute: `${trip.fromCity || ''}→${trip.toCity || ''}`,
      participants: [from, to],
      labels,
      updatedAt: t,
      lastText: text,
      lastFrom: from,
      lastAt: t
    };
    if (cur && cur.data) {
      await convRef.update({ data: convData });
    } else {
      await convRef.set({ data: Object.assign({ createdAt: t }, convData) });
    }

    const addRes = await db.collection('chat_messages').add({
      data: { convId, tripId, from, to, text, createdAt: t }
    });

    return ok({ convId, msgId: addRes._id, createdAt: t });
  } catch (e) {
    console.error('chatSend error', e);
    return fail('发送失败，请稍后重试');
  }
};
