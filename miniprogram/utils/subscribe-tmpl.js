// utils/subscribe-tmpl.js
// 订阅消息模板 ID 配置 + 字段说明
//
// ⚠️ 使用前必读：
// 1. 在微信公众平台 → 功能 → 订阅消息 → 公共模板库，申请以下模板（或选字段相似的）
// 2. 把申请到的模板 ID 填到下方，同时把同样的 ID 配到云函数 subscribeNotify 的环境变量
// 3. 模板字段的「关键词」（thing1/time2 等）必须与下方 data 里的 key 一一对应，否则发送失败
// 4. 一次性订阅：用户每次授权只能用一次，所以要在关键动作发生「前」引导授权
//
// 官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/subscribe-message.html

// 模板 ID（未配置时为空字符串，相关功能自动跳过，不阻断主流程）
const TMPL = {
  NEW_APPLY: '',      // 收到新报名：建议模板字段 thing1=行程, time2=日期, thing3=说明
  APPLY_RESULT: '',   // 报名结果：建议字段 thing1=结果, thing2=行程, time3=日期
  NEW_MESSAGE: ''     // 收到新消息：建议字段 thing1=发送人, thing2=内容, time3=时间
};

// 过滤空模板 ID；微信单次 requestSubscribeMessage 最多 3 个
function normalize(ids) {
  return (Array.isArray(ids) ? ids : [])
    .map(x => String(x || '').trim())
    .filter(x => x.length > 0)
    .slice(0, 3);
}

// 求带人授权：报名结果与新消息
function requestApplicantSubscribe() {
  const ids = normalize([TMPL.APPLY_RESULT, TMPL.NEW_MESSAGE]);
  if (!ids.length) return Promise.resolve();
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: () => resolve(),
      fail: () => resolve(),
      complete: () => resolve()
    });
  });
}

// 带货人授权：新报名与新消息
function requestPublisherSubscribe() {
  const ids = normalize([TMPL.NEW_APPLY, TMPL.NEW_MESSAGE]);
  if (!ids.length) return Promise.resolve();
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: () => resolve(),
      fail: () => resolve(),
      complete: () => resolve()
    });
  });
}

// 仅授权新消息（聊天页用）
function requestMessageSubscribe() {
  const ids = normalize([TMPL.NEW_MESSAGE]);
  if (!ids.length) return Promise.resolve();
  return new Promise(resolve => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: () => resolve(),
      fail: () => resolve(),
      complete: () => resolve()
    });
  });
}

module.exports = {
  TMPL,
  requestApplicantSubscribe,
  requestPublisherSubscribe,
  requestMessageSubscribe
};
