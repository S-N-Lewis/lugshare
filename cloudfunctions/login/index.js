// cloudfunctions/login/index.js
// 静默登录云函数：换取 openid， lazily 创建用户记录
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxCtx = cloud.getWXContext();
  const openid = wxCtx.OPENID;
  if (!openid) {
    return { ok: false, msg: '无法获取用户标识' };
  }

  try {
    // 已存在则不再创建（user-openid 合集）
    const exist = await db.collection('users').where({ openid }).count();
    if (exist.total === 0) {
      await db.collection('users').add({
        data: {
          openid,
          nickName: '',
          avatarUrl: '',
          tripsPosted: 0,
          demandsJoined: 0,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
    }
    return { ok: true, data: { openid } };
  } catch (e) {
    console.error('login error', e);
    return { ok: false, msg: '登录失败，请重试' };
  }
};
