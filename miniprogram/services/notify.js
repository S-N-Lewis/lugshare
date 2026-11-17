// services/notify.js - 订阅消息触发封装

// 通知动作（与云函数 subscribeNotify 的 kind 对应）
function newApply(tripId, demandId) {
  return call({ kind: 'new_apply', tripId, demandId });
}
function applyResult(tripId, demandId, resultLabel) {
  return call({ kind: 'apply_result', tripId, demandId, resultLabel });
}
function newMessage(tripId, to, text, convId, fromName) {
  return call({ kind: 'new_message', tripId, to, text, convId, fromName });
}

function call(data) {
  // 推送是旁路操作：失败静默，绝不阻断主流程
  return wx.cloud.callFunction({ name: 'subscribeNotify', data })
    .then(res => (res && res.result) || {})
    .catch(() => ({}));
}

module.exports = { newApply, applyResult, newMessage };
