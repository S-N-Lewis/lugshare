// services/demand.js - 需求（报名）相关云函数调用封装

async function call(action, data = {}) {
  const res = await wx.cloud.callFunction({
    name: 'demand',
    data: { action, ...data }
  });
  const result = res.result || {};
  if (result.ok === false) {
    throw new Error(result.msg || '操作失败');
  }
  return result.data;
}

// 提交报名需求
function submit(payload) {
  return call('submit', { payload });
}

// 某行程下的需求列表（带货人视角）
function listByTrip(tripId) {
  return call('listByTrip', { tripId });
}

// 我参与的需求（求带人视角）
function mine() {
  return call('mine');
}

// 更新需求状态（双方按权限操作）
function updateStatus(id, status, extra = {}) {
  return call('updateStatus', { id, status, ...extra });
}

module.exports = { submit, listByTrip, mine, updateStatus };
