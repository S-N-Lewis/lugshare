// services/trip.js - 行程相关云函数调用封装
const app = getApp();

async function call(action, data = {}) {
  const res = await wx.cloud.callFunction({
    name: 'trip',
    data: { action, ...data }
  });
  const result = res.result || {};
  if (result.ok === false) {
    throw new Error(result.msg || '操作失败');
  }
  return result.data;
}

// 发布行程
function publish(payload) {
  return call('publish', { payload });
}

// 行程列表（支持筛选）
function list({ fromCity, toCity, date, page = 1, size = 10 } = {}) {
  return call('list', { fromCity, toCity, date, page, size });
}

// 行程详情
function detail(id) {
  return call('detail', { id });
}

// 我发布的行程
function mine() {
  return call('mine');
}

// 关闭/开放行程
function updateStatus(id, status) {
  return call('updateStatus', { id, status });
}

module.exports = { publish, list, detail, mine, updateStatus };
