// cloudfunctions/subscribeNotify/index.js
// 订阅消息推送：收到新报名 / 报名结果 / 收到新消息
// 模板 ID 从环境变量读取（与前端 utils/subscribe-tmpl.js 对应），未配置则自动跳过
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TMPL_NEW_APPLY = String(process.env.TMPL_NEW_APPLY || '').trim();
const TMPL_APPLY_RESULT = String(process.env.TMPL_APPLY_RESULT || '').trim();
const TMPL_NEW_MESSAGE = String(process.env.TMPL_NEW_MESSAGE || '').trim();
// 体验版/开发版调试时改成 trial / developer；正式版保持 formal
const MINIPROGRAM_STATE = String(process.env.MP_STATE || 'formal').trim();

function ok(data) { return Object.assign({ ok: true }, data || {}); }
function fail(msg) { return { ok: false, msg }; }
function sliceStr(s, max) {
  const t = String(s || '').trim();
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)) + '…';
}

// 发送（失败降级：模板未配/用户拒收/配额耗尽都不阻断主流程）
async function sendRaw(templateId, touser, page, data) {
  if (!templateId || !touser) return { skipped: true, reason: '未配置模板或无接收人' };
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: String(touser),
      templateId: String(templateId),
      page: String(page || 'pages/index/index'),
      data,
      miniprogram_state: MINIPROGRAM_STATE,
      lang: 'zh_CN'
    });
    return { sent: true };
  } catch (err) {
    console.warn('订阅消息发送失败（已降级）', err && (err.errCode || err.message));
    return { skipped: true, reason: '发送失败', detail: String(err && (err.errCode || err.message) || err) };
  }
}

exports.main = async (event) => {
  const payload = event || {};
  const kind = String(payload.kind || '').trim();
  const caller = String(cloud.getWXContext().OPENID || '').trim();

  try {
    // ---- 1. 收到新报名 → 通知带货人 ----
    if (kind === 'new_apply') {
      const tripId = String(payload.tripId || '').trim();
      const demandId = String(payload.demandId || '').trim();
      if (!tripId || !demandId) return fail('参数错误');
      const dRes = await db.collection('demands').doc(demandId).get().catch(() => null);
      const d = dRes && dRes.data;
      if (!d || d.tripId !== tripId || d.status !== 'pending') return fail('需求状态不可推送');
      if (caller && d.openid !== caller) return fail('无权限');
      const tRes = await db.collection('trips').doc(tripId).get().catch(() => null);
      const t = tRes && tRes.data;
      if (!t) return fail('行程不存在');
      const route = `${t.fromCity || ''}→${t.toCity || ''}`;
      const date = t.deadline || t.departDate || '—';
      const data = {
        thing1: { value: sliceStr(route, 20) },
        time2: { value: sliceStr(date, 16) },
        thing3: { value: sliceStr(`${d.nickName || '有人'} 报名约${d.estKg || 0}kg`, 20) }
      };
      const page = `pages/detail/detail?id=${encodeURIComponent(tripId)}`;
      return ok({ send: await sendRaw(TMPL_NEW_APPLY, t.openid, page, data) });
    }

    // ---- 2. 报名结果 → 通知求带人 ----
    if (kind === 'apply_result') {
      const tripId = String(payload.tripId || '').trim();
      const demandId = String(payload.demandId || '').trim();
      if (!tripId || !demandId) return fail('参数错误');
      const dRes = await db.collection('demands').doc(demandId).get().catch(() => null);
      const d = dRes && dRes.data;
      if (!d || d.tripId !== tripId) return fail('需求不存在');
      if (caller && d.ownerOpenid !== caller) return fail('无权限');
      const tRes = await db.collection('trips').doc(tripId).get().catch(() => null);
      const t = tRes && tRes.data;
      const route = t ? `${t.fromCity || ''}→${t.toCity || ''}` : '行程';
      const date = t ? (t.deadline || t.departDate || '—') : '—';
      const resultLabel = String(payload.resultLabel || '');
      const label = resultLabel || ({ accepted: '已通过', rejected: '未通过' }[d.status] || '已更新');
      const data = {
        thing1: { value: sliceStr(label, 20) },
        thing2: { value: sliceStr(route, 20) },
        time3: { value: sliceStr(date, 16) }
      };
      const page = `pages/detail/detail?id=${encodeURIComponent(tripId)}`;
      return ok({ send: await sendRaw(TMPL_APPLY_RESULT, d.openid, page, data) });
    }

    // ---- 3. 收到新消息 → 通知聊天对方 ----
    if (kind === 'new_message') {
      const tripId = String(payload.tripId || '').trim();
      const to = String(payload.to || '').trim();
      const text = String(payload.text || '').trim();
      if (!tripId || !to || !text) return fail('参数错误');
      // 校验：接收方必须是行程相关用户
      const tRes = await db.collection('trips').doc(tripId).get().catch(() => null);
      const t = tRes && tRes.data;
      if (!t) return fail('行程不存在');
      let related = to === t.openid;
      if (!related) {
        const cnt = await db.collection('demands').where({
          tripId, openid: to, status: db.command.nin(['rejected', 'cancelled'])
        }).count().catch(() => ({ total: 0 }));
        related = cnt.total > 0;
      }
      if (!related) return fail('接收方非行程相关用户');
      const fromName = String(payload.fromName || '对方');
      const route = `${t.fromCity || ''}→${t.toCity || ''}`;
      const data = {
        thing1: { value: sliceStr(fromName, 20) },
        thing2: { value: sliceStr(text, 20) },
        time3: { value: sliceStr(route, 16) }
      };
      const convId = String(payload.convId || '').trim();
      const page = convId
        ? `pages/chat/chat?convId=${encodeURIComponent(convId)}&tripId=${encodeURIComponent(tripId)}`
        : `pages/messages/messages`;
      return ok({ send: await sendRaw(TMPL_NEW_MESSAGE, to, page, data) });
    }

    return fail('未知通知类型');
  } catch (e) {
    console.error('subscribeNotify error', e);
    // 推送失败绝不影响主流程
    return ok({ send: { skipped: true, reason: '服务异常' } });
  }
};
