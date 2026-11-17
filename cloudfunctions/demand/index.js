// cloudfunctions/demand/index.js
// 需求（求带人报名）与状态流转。核心：额度占用/释放用事务防超卖
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

const ACTIVE_STATUSES = ['pending', 'accepted', 'shipped', 'in_transit'];

function ok(data) { return { ok: true, data }; }
function fail(msg) { return { ok: false, msg }; }

// 微信内容安全检测（官方 API：cloud.openapi.security.msgSecCheck）
// 文档：https://developers.weixin.qq.com/miniprogram/dev/api/open-api/sec-check/msgSecCheck.html
// 策略：命中违规一律拦截；能力未开通/调用异常时降级放行（本地违禁词库仍生效），避免阻断正常用户
async function secCheckText(...texts) {
  const content = texts.filter(Boolean).map(t => String(t).trim()).join(' ').slice(0, 2500);
  if (!content) return null;
  try {
    const res = await cloud.openapi.security.msgSecCheck({ content, version: 2 });
    if (res && res.result && res.result.suggest === 'risky') {
      return '内容含违规信息，请修改后再提交';
    }
  } catch (e) {
    // 未开通内容安全能力或配额耗尽时降级：仅记录，不阻断
    console.warn('msgSecCheck 不可用，降级为本地词库校验', e && e.errCode);
  }
  return null;
}

exports.main = async (event, context) => {
  const { action } = event;
  const openid = cloud.getWXContext().OPENID;
  if (!openid) return fail('请先登录');

  try {
    switch (action) {
      case 'submit': {
        const p = event.payload || {};
        if (!p.tripId) return fail('缺少行程');
        if (!p.itemName || !String(p.itemName).trim()) return fail('请填写物品名称');
        const estKg = Number(p.estKg);
        if (!estKg || estKg <= 0) return fail('请填写预估重量');
        if (hasBanned(p.itemName) || hasBanned(p.note) || hasBanned(p.address)) {
          return fail('内容包含不宜发布的词汇，请修改后再提交');
        }
        if (p.compliance !== true) return fail('请先确认合规承诺');
        const secErr = await secCheckText(p.itemName, p.note, p.address);
        if (secErr) return fail(secErr);

        // 事务：校验重复报名/额度 → 写入需求 → 累加 usedKg
        const transaction = await db.startTransaction();
        try {
          const tripRes = await transaction.collection('trips').doc(p.tripId).get();
          const trip = tripRes.data;
          if (!trip) { await transaction.rollback(); return fail('行程不存在'); }
          if (trip.status !== 'open') { await transaction.rollback(); return fail('该行程已关闭接单'); }
          if (trip.openid === openid) { await transaction.rollback(); return fail('不能报名自己发布的行程'); }

          // 去重：同一用户对同一行程仅允许一条进行中的报名（借鉴校园顺风车 bookingSubmit）
          const dup = await transaction.collection('demands').where({
            tripId: p.tripId,
            openid,
            status: _.in(['pending', 'accepted', 'shipped', 'in_transit'])
          }).count();
          if (dup.total > 0) {
            await transaction.rollback();
            return fail('你已报名过该行程，请勿重复提交');
          }

          const remain = Number(trip.capacityKg) - Number(trip.usedKg || 0);
          if (estKg > remain) {
            await transaction.rollback();
            return fail(`剩余额度仅 ${remain.toFixed(1)}kg，请减小重量`);
          }

          const now = db.serverDate();
          const addRes = await transaction.collection('demands').add({
            data: {
              tripId: p.tripId,
              openid,                       // 求带人
              ownerOpenid: trip.openid,     // 带货人（冗余，便于按人查）
              nickName: p.nickName || '匿名用户',
              avatarUrl: p.avatarUrl || '',
              itemName: String(p.itemName).trim(),
              estKg,
              pickupType: p.pickupType || 'self',
              address: (p.address || '').trim(),
              expressNo: (p.expressNo || '').trim(),
              note: (p.note || '').trim(),
              greeting: (p.greeting || '').trim().slice(0, 200), // 一键招呼语（供线下沟通用）
              status: 'pending',
              actualKg: 0,
              amount: 0,
              paid: false,
              createdAt: now,
              updatedAt: now
            }
          });
          await transaction.collection('trips').doc(p.tripId).update({
            data: { usedKg: _.inc(estKg), updatedAt: now }
          });
          await transaction.commit();
          return ok({ id: addRes._id });
        } catch (e) {
          await transaction.rollback();
          throw e;
        }
      }

      case 'listByTrip': {
        const tripId = event.tripId;
        if (!tripId) return fail('缺少行程 ID');
        const res = await db.collection('demands')
          .where({ tripId })
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get();
        return ok({ list: res.data });
      }

      case 'mine': {
        const res = await db.collection('demands')
          .where({ openid })
          .orderBy('createdAt', 'desc')
          .limit(100)
          .get();
        return ok({ list: res.data });
      }

      case 'updateStatus': {
        const { id, status, actualKg, amount, paid } = event;
        const ALLOWED = ['accepted', 'rejected', 'shipped', 'in_transit', 'delivered', 'cancelled'];
        if (!id || ALLOWED.indexOf(status) === -1) return fail('参数错误');

        const res = await db.collection('demands').doc(id).get();
        const d = res.data;
        if (!d) return fail('需求不存在');
        const isOwner = d.ownerOpenid === openid;   // 带货人
        const isApplicant = d.openid === openid;    // 求带人

        // 权限矩阵
        const ownerActions = ['accepted', 'rejected', 'shipped', 'in_transit', 'delivered'];
        if (ownerActions.indexOf(status) !== -1 && !isOwner) return fail('仅带货人可操作');
        if (status === 'cancelled' && !isApplicant) return fail('仅求带人可撤回');
        if (status === 'accepted' && d.status !== 'pending') return fail('当前状态不可确认');
        if (status === 'cancelled' && d.status !== 'pending') return fail('当前状态不可撤回');

        const updateData = { status, updatedAt: db.serverDate() };
        if (typeof actualKg === 'number' && actualKg > 0) updateData.actualKg = actualKg;
        if (typeof amount === 'number' && amount >= 0) updateData.amount = amount;
        if (typeof paid === 'boolean') updateData.paid = paid;

        // 事务：改需求状态 + 同步行程额度（拒绝/撤回时释放占用）
        const transaction = await db.startTransaction();
        try {
          await transaction.collection('demands').doc(id).update({ data: updateData });
          const release = (status === 'rejected' || status === 'cancelled') && ACTIVE_STATUSES.indexOf(d.status) !== -1;
          if (release) {
            await transaction.collection('trips').doc(d.tripId).update({
              data: { usedKg: _.inc(-Number(d.estKg || 0)), updatedAt: db.serverDate() }
            });
          }
          // 实际重量与预估值差异，结算时校准额度
          if (status === 'delivered' && typeof actualKg === 'number' && actualKg > 0 && actualKg !== Number(d.estKg || 0)) {
            const delta = actualKg - Number(d.estKg || 0);
            await transaction.collection('trips').doc(d.tripId).update({
              data: { usedKg: _.inc(delta), updatedAt: db.serverDate() }
            });
          }
          await transaction.commit();
          return ok({ id, status });
        } catch (e) {
          await transaction.rollback();
          throw e;
        }
      }

      default:
        return fail('未知操作');
    }
  } catch (e) {
    console.error('demand error', e);
    return fail('服务异常，请稍后重试');
  }
};
