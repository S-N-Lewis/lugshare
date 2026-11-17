// cloudfunctions/trip/index.js
// 行程（带货人发布的路线 + 可捎带额度）CRUD
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 云函数侧违禁词二次校验（与前端 constants.js 保持一致，防前端绕过）
const BANNED_KEYWORDS = [
  '毒品', '海洛因', '冰毒', '大麻', '可卡因',
  '枪支', '弹药', '爆炸物', '炸药', '雷管',
  '管制刀具', '刀具', '匕首',
  '走私', '代购牟利', '逃税', '避税',
  '活体', '宠物走私', '濒危', '象牙', '犀牛角',
  '易燃易爆', '汽油', '酒精燃料'
];

function hasBanned(text) {
  if (!text) return false;
  const s = String(text).toLowerCase();
  return BANNED_KEYWORDS.some(w => s.indexOf(w.toLowerCase()) !== -1);
}

function ok(data) { return { ok: true, data }; }
function fail(msg) { return { ok: false, msg }; }

// 微信内容安全检测；命中违规拦截，能力不可用时降级放行（本地词库仍生效）
// 文档：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/sec-check/msgSecCheck.html
async function secCheckText(...texts) {
  const content = texts.filter(Boolean).map(t => String(t).trim()).join(' ').slice(0, 2500);
  if (!content) return null;
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content, version: 2 });
    if (res && res.result && res.result.suggest === 'risky') {
      return '内容含违规信息，请修改后再提交';
    }
  } catch (e) {
    console.warn('msgSecCheck 不可用，降级为本地词库校验', e && e.errCode);
  }
  return null;
}

exports.main = async (event, context) => {
  const { action } = event;
  const openid = cloud.getWXContext().OPENID;
  if (!openid && action !== 'list' && action !== 'detail') {
    return fail('请先登录');
  }

  try {
    switch (action) {
      case 'publish': {
        const p = event.payload || {};
        // 参数校验
        if (!p.fromCity || !p.toCity || !p.departDate) return fail('请填写出发地、目的地和日期');
        if (p.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(p.deadline)) return fail('收货截止日格式不正确');
        if (!p.capacityKg || Number(p.capacityKg) <= 0) return fail('请填写可捎带重量');
        if (hasBanned(p.note) || hasBanned(p.routeNote)) return fail('内容包含不宜发布的词汇，请修改后再提交');
        if (p.compliance !== true) return fail('请先阅读并勾选合规承诺');
        const secErr = await secCheckText(p.note, p.routeNote, p.pickupAddress);
        if (secErr) return fail(secErr);

        const doc = {
          openid,
          ownerNick: p.nickName || '匿名用户',
          ownerAvatar: p.avatarUrl || '',
          fromCity: p.fromCity.trim(),
          toCity: p.toCity.trim(),
          departDate: p.departDate,          // YYYY-MM-DD 出发日
          deadline: p.deadline || '',        // 收货截止日（真正的死线，可能早于出发日）
          flightNo: (p.flightNo || '').trim().toUpperCase(),
          capacityKg: Number(p.capacityKg),  // 总额度
          usedKg: 0,                         // 已占用额度
          pricePerKg: Number(p.pricePerKg) || 0,
          minFee: Number(p.minFee) || 0,
          pickupAddress: (p.pickupAddress || '').trim(),
          acceptedItems: Array.isArray(p.acceptedItems) ? p.acceptedItems.slice(0, 20) : [], // 可带品类 key 列表
          rejectedItems: Array.isArray(p.rejectedItems) ? p.rejectedItems.slice(0, 20) : [], // 不可带品类 key 列表
          liabilities: Array.isArray(p.liabilities) ? p.liabilities.slice(0, 10) : [],       // 责任条款
          note: (p.note || '').trim(),
          routeNote: (p.routeNote || '').trim(),
          contactWx: (p.contactWx || '').trim(),
          status: 'open',
          viewCount: 0,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        };
        const res = await db.collection('trips').add({ data: doc });

        // 更新用户统计（忽略失败）
        try {
          await db.collection('users').where({ openid }).update({
            data: { tripsPosted: _.inc(1), updatedAt: db.serverDate() }
          });
        } catch (e) { console.warn('更新用户统计失败', e); }

        return ok({ id: res._id });
      }

      case 'list': {
        const { fromCity, toCity, date, page = 1, size = 10 } = event;
        const where = { status: 'open' };
        if (fromCity) where.fromCity = db.RegExp({ regexp: fromCity, options: 'i' });
        if (toCity) where.toCity = db.RegExp({ regexp: toCity, options: 'i' });
        if (date) where.departDate = date;

        const p = Number(page) || 1;
        const s = Math.min(Number(size) || 10, 20);
        const count = await db.collection('trips').where(where).count();
        const list = await db.collection('trips')
          .where(where)
          .orderBy('departDate', 'asc')
          .orderBy('createdAt', 'desc')
          .skip((p - 1) * s)
          .limit(s)
          .get();
        return ok({ list: list.data, total: count.total, page: p, hasMore: p * s < count.total });
      }

      case 'detail': {
        const id = event.id;
        if (!id) return fail('缺少行程 ID');
        const res = await db.collection('trips').doc(id).get();
        if (!res.data) return fail('行程不存在');
        // 浏览量 +1（忽略失败）
        try {
          await db.collection('trips').doc(id).update({ data: { viewCount: _.inc(1) } });
        } catch (e) { /* noop */ }
        return ok(res.data);
      }

      case 'mine': {
        const res = await db.collection('trips')
          .where({ openid })
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
        return ok({ list: res.data });
      }

      case 'updateStatus': {
        const { id, status } = event;
        if (!id || (status !== 'open' && status !== 'closed')) return fail('参数错误');
        // 仅发布者可改状态：先查归属
        const doc = await db.collection('trips').doc(id).get();
        if (!doc.data) return fail('行程不存在');
        if (doc.data.openid !== openid) return fail('无权操作此行程');
        await db.collection('trips').doc(id).update({
          data: { status, updatedAt: db.serverDate() }
        });

        // 关闭行程时：自动拒绝所有 pending 需求并释放其占用的额度
        // （本项目报名即占额度，故与"确认才扣座"的顺风车项目做法不同——不误伤已占额度的报名者）
        let autoRejected = 0;
        if (status === 'closed') {
          try {
            const pendings = await db.collection('demands')
              .where({ tripId: id, status: 'pending' })
              .limit(100)
              .get();
            const rows = pendings.data || [];
            for (const d of rows) {
              await db.collection('demands').doc(d._id).update({
                data: { status: 'rejected', updatedAt: db.serverDate() }
              });
            }
            const freed = rows.reduce((sum, d) => sum + (Number(d.estKg) || 0), 0);
            if (freed > 0) {
              await db.collection('trips').doc(id).update({
                data: { usedKg: _.inc(-freed), updatedAt: db.serverDate() }
              });
            }
            autoRejected = rows.length;
          } catch (e) {
            console.warn('关闭行程时清理 pending 失败', e);
          }
        }
        return ok({ id, status, autoRejected });
      }

      default:
        return fail('未知操作');
    }
  } catch (e) {
    console.error('trip error', e);
    return fail('服务异常，请稍后重试');
  }
};
