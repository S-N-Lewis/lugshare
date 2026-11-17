// services/chat.js - 聊天相关云函数调用 + 轮询封装

async function call(name, data = {}) {
  const res = await wx.cloud.callFunction({ name, data });
  return res.result || {};
}

function send(tripId, toOpenid, text) {
  return call('chatSend', { tripId, toOpenid, text });
}
function conversations() {
  return call('chatConversations', {});
}
function messages(convId, before = 0, size = 30) {
  return call('chatMessages', { convId, before, size });
}
function markRead(convId) {
  return call('chatReadMark', { convId });
}

// 会话 ID（与云函数 chatSend 保持一致：tripId + 双方 openid 排序）
function convIdOf(tripId, a, b) {
  const x = a < b ? a : b;
  const y = a < b ? b : a;
  return `conv__${tripId}__${x}__${y}`;
}

/**
 * 轻量轮询器：签名变化时回调，失败指数退避，页面卸载时 close
 * @param {() => Promise<any[]>} fetcher
 * @param {(rows:any[])=>void} onChange
 * @param {number} gap 轮询间隔 ms
 */
function createPoller(fetcher, onChange, gap = 3000) {
  let closed = false;
  let timer = null;
  let inFlight = false;
  let lastSig = '';
  let fails = 0;

  function sig(rows) {
    return (rows || []).map(r => `${r._id || r.convId || ''}:${r.updatedAt || r.createdAt || 0}`).join('|');
  }
  function schedule(delay) {
    if (closed) return;
    timer = setTimeout(run, delay);
  }
  function run() {
    if (closed) return;
    if (inFlight) { schedule(gap); return; }
    inFlight = true;
    fetcher().then(rows => {
      if (closed) return;
      fails = 0;
      const s = sig(rows);
      if (s !== lastSig) { lastSig = s; onChange(rows || []); }
    }).catch(e => {
      fails = Math.min(5, fails + 1);
      console.warn('轮询失败', e);
    }).finally(() => {
      inFlight = false;
      schedule(fails ? Math.min(20000, gap * Math.pow(2, fails)) : gap);
    });
  }
  run();
  return { close() { closed = true; if (timer) clearTimeout(timer); } };
}

module.exports = { send, conversations, messages, markRead, createPoller, convIdOf };
