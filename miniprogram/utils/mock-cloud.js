// utils/mock-cloud.js
// 本地演示模式：拦截 wx.cloud.callFunction，用 Storage 模拟全部云函数
// 目的：不开通云开发、不部署云函数，也能真机跑通完整交互
// 开关：miniprogram/config.js 的 USE_MOCK

const KEY = 'MOCK_DB_V1';
const ME = 'mock_me';
const { formatTime } = require('./format.js');

function now() { return Date.now(); }
function id(p) { return p + '_' + now().toString(36) + Math.random().toString(36).slice(2, 6); }

function seed() {
  const t = now();
  const day = 86400000;
  const trips = [
    {
      _id: 'seed_t1', openid: 'mock_u1', ownerNick: '小林', ownerAvatar: '',
      fromCity: '奥克兰', toCity: '上海', departDate: '2026-12-05', deadline: '2026-12-01',
      flightNo: 'NZ289', capacityKg: 12, usedKg: 3, pricePerKg: 8, minFee: 20,
      pickupAddress: '奥克兰市区可自送', acceptedItems: ['clothes', 'books'], rejectedItems: ['liquid', 'battery'],
      liabilities: ['tax_self', 'no_prepay'], note: '行李箱还有空间，小件优先',
      routeNote: '直飞上海，落地浦东', contactWx: '', status: 'open',
      viewCount: 24, createdAt: t - day, updatedAt: t - day
    },
    {
      _id: 'seed_t2', openid: 'mock_u2', ownerNick: 'Amy', ownerAvatar: '',
      fromCity: '奥克兰', toCity: '香港', departDate: '2026-12-12', deadline: '2026-12-08',
      flightNo: 'CX198', capacityKg: 8, usedKg: 1, pricePerKg: 10, minFee: 0,
      pickupAddress: '', acceptedItems: ['clothes', 'snacks'], rejectedItems: ['liquid'],
      liabilities: ['tax_self'], note: '只带衣物和零食', routeNote: '', contactWx: '',
      status: 'open', viewCount: 11, createdAt: t - 2 * day, updatedAt: t - 2 * day
    },
    {
      _id: 'seed_t3', openid: 'mock_u3', ownerNick: '老周', ownerAvatar: '',
      fromCity: '上海', toCity: '奥克兰', departDate: '2027-01-10', deadline: '2027-01-05',
      flightNo: 'NZ288', capacityKg: 20, usedKg: 0, pricePerKg: 6, minFee: 0,
      pickupAddress: '上海浦东可面交', acceptedItems: ['books', 'clothes'], rejectedItems: [],
      liabilities: ['tax_self', 'confiscate_self'], note: '返程空箱，额度多',
      routeNote: '', contactWx: '', status: 'open', viewCount: 7,
      createdAt: t - 3 * day, updatedAt: t - 3 * day
    },
    {
      _id: 'seed_tmine', openid: ME, ownerNick: '我', ownerAvatar: '',
      fromCity: '奥克兰', toCity: '广州', departDate: '2026-12-20', deadline: '2026-12-15',
      flightNo: 'CZ306', capacityKg: 10, usedKg: 2, pricePerKg: 5, minFee: 0,
      pickupAddress: '奥克兰南区', acceptedItems: ['clothes', 'books'], rejectedItems: ['liquid'],
      liabilities: ['tax_self'], note: '自己回家，可顺路捎', routeNote: '',
      contactWx: '', status: 'open', viewCount: 15,
      createdAt: t - 4 * day, updatedAt: t - 4 * day
    }
  ];
  const demands = [
    {
      _id: 'seed_d1', tripId: 'seed_tmine', openid: 'mock_u4', ownerOpenid: ME,
      nickName: '小陈', avatarUrl: '', itemName: '冬衣两件', estKg: 2,
      pickupType: 'self', address: '', expressNo: '', note: '想麻烦带到广州',
      status: 'pending', actualKg: 0, amount: 0, paid: false,
      greeting: '从奥克兰寄广州，冬衣两件，约2kg', createdAt: t - 3600000, updatedAt: t - 3600000
    }
  ];
  const convId = convIdOf('seed_tmine', 'mock_u4', ME);
  const convs = [
    {
      _id: 'seed_c1', convId, tripId: 'seed_tmine',
      participants: ['mock_u4', ME],
      labels: { mock_u4: '小陈', [ME]: '我' },
      lastMsg: '你好，东西大概什么时候方便送过来？',
      updatedAt: t - 1800000, createdAt: t - 3600000
    }
  ];
  const msgs = [
    { _id: 'seed_m1', convId, tripId: 'seed_tmine', from: 'mock_u4', to: ME, text: '你好，我想问一下冬衣还能带吗？', createdAt: t - 3600000 },
    { _id: 'seed_m2', convId, tripId: 'seed_tmine', from: ME, to: 'mock_u4', text: '可以的，还有 8kg 额度', createdAt: t - 3000000 },
    { _id: 'seed_m3', convId, tripId: 'seed_tmine', from: 'mock_u4', to: ME, text: '你好，东西大概什么时候方便送过来？', createdAt: t - 1800000 }
  ];
  return { trips, demands, convs, msgs, readState: {} };
}

function load() {
  let db = null;
  try { db = wx.getStorageSync(KEY); } catch (e) { /* noop */ }
  if (!db || !Array.isArray(db.trips)) {
    db = seed();
    save(db);
  }
  return db;
}
function save(db) {
  try { wx.setStorageSync(KEY, db); } catch (e) { console.warn('mock 数据保存失败', e); }
}
function reset() {
  const db = seed();
  save(db);
  return db;
}

const ok = data => ({ ok: true, data });
const fail = msg => ({ ok: false, msg });
const R = result => Promise.resolve({ result });

function handleTrip(db, event) {
  const p = event.payload || {};
  switch (event.action) {
    case 'publish': {
      if (!p.fromCity || !p.toCity || !p.departDate) return fail('请填写出发地、目的地和日期');
      if (!p.capacityKg || Number(p.capacityKg) <= 0) return fail('请填写可捎带重量');
      if (p.compliance !== true) return fail('请先阅读并勾选合规承诺');
      const t = now();
      const doc = Object.assign({}, p, {
        _id: id('t'), openid: ME, ownerNick: p.nickName || '我', ownerAvatar: p.avatarUrl || '',
        usedKg: 0, status: 'open', viewCount: 0, createdAt: t, updatedAt: t
      });
      db.trips.unshift(doc);
      save(db);
      return ok({ id: doc._id });
    }
    case 'list': {
      const { fromCity, toCity, date, page = 1, size = 10 } = event;
      let rows = db.trips.filter(t => t.status === 'open');
      if (fromCity) rows = rows.filter(t => (t.fromCity || '').indexOf(fromCity) >= 0);
      if (toCity) rows = rows.filter(t => (t.toCity || '').indexOf(toCity) >= 0);
      if (date) rows = rows.filter(t => t.departDate === date);
      rows.sort((a, b) => (a.departDate || '').localeCompare(b.departDate || '') || (b.createdAt - a.createdAt));
      const p = Number(page) || 1, s = Math.min(Number(size) || 10, 20);
      return ok({ list: rows.slice((p - 1) * s, p * s), total: rows.length, page: p, hasMore: p * s < rows.length });
    }
    case 'detail': {
      const t = db.trips.find(x => x._id === event.id);
      if (!t) return fail('行程不存在');
      t.viewCount = (t.viewCount || 0) + 1;
      save(db);
      return ok(Object.assign({}, t));
    }
    case 'mine':
      return ok({ list: db.trips.filter(t => t.openid === ME).sort((a, b) => b.createdAt - a.createdAt) });
    case 'updateStatus': {
      const t = db.trips.find(x => x._id === event.id);
      if (!t) return fail('行程不存在');
      if (t.openid !== ME) return fail('无权操作此行程');
      t.status = event.status;
      t.updatedAt = now();
      let autoRejected = 0;
      if (event.status === 'closed') {
        db.demands.forEach(d => {
          if (d.tripId === t._id && d.status === 'pending') { d.status = 'rejected'; autoRejected++; }
        });
      }
      save(db);
      return ok({ id: t._id, status: t.status, autoRejected });
    }
    default: return fail('未知操作');
  }
}

function handleDemand(db, event) {
  const p = event.payload || {};
  switch (event.action) {
    case 'submit': {
      if (!p.tripId) return fail('缺少行程');
      if (!p.itemName || !String(p.itemName).trim()) return fail('请填写物品名称');
      const estKg = Number(p.estKg);
      if (!estKg || estKg <= 0) return fail('请填写预估重量');
      if (p.compliance !== true) return fail('请先确认合规承诺');
      const t = db.trips.find(x => x._id === p.tripId);
      if (!t) return fail('行程不存在');
      if (t.status !== 'open') return fail('该行程已关闭接单');
      if (t.openid === ME) return fail('不能报名自己发布的行程');
      if (db.demands.some(d => d.tripId === p.tripId && d.openid === ME && d.status !== 'rejected' && d.status !== 'cancelled')) {
        return fail('你已报名过该行程，请勿重复提交');
      }
      const remain = Number(t.capacityKg) - Number(t.usedKg || 0);
      if (estKg > remain) return fail(`剩余额度仅 ${remain.toFixed(1)}kg，请减小重量`);
      const ts = now();
      const doc = Object.assign({}, p, {
        _id: id('d'), openid: ME, ownerOpenid: t.openid,
        estKg, status: 'pending', actualKg: 0, amount: 0, paid: false,
        createdAt: ts, updatedAt: ts
      });
      db.demands.unshift(doc);
      t.usedKg = Number(t.usedKg || 0) + estKg;
      save(db);
      return ok({ id: doc._id });
    }
    case 'listByTrip':
      return ok({ list: db.demands.filter(d => d.tripId === event.tripId).sort((a, b) => b.createdAt - a.createdAt) });
    case 'mine':
      return ok({ list: db.demands.filter(d => d.openid === ME).sort((a, b) => b.createdAt - a.createdAt) });
    case 'updateStatus': {
      const d = db.demands.find(x => x._id === event.id);
      if (!d) return fail('需求不存在');
      const prev = d.status;
      d.status = event.status;
      d.updatedAt = now();
      if (event.actualKg !== undefined) d.actualKg = Number(event.actualKg);
      if (event.amount !== undefined) d.amount = Number(event.amount);
      if (event.paid !== undefined) d.paid = !!event.paid;
      const released = ['rejected', 'cancelled'];
      if ((released.indexOf(event.status) >= 0) && released.indexOf(prev) < 0) {
        const t = db.trips.find(x => x._id === d.tripId);
        if (t) t.usedKg = Math.max(0, Number(t.usedKg || 0) - Number(d.estKg || 0));
      }
      save(db);
      return ok({ id: d._id, status: d.status });
    }
    default: return fail('未知操作');
  }
}

function convIdOf(tripId, a, b) {
  const x = a < b ? a : b, y = a < b ? b : a;
  return `conv__${tripId}__${x}__${y}`;
}

function handleChat(name, db, event) {
  switch (name) {
    case 'chatSend': {
      const { tripId, toOpenid: to, text } = event;
      if (!tripId || !to || !text) return fail('参数错误');
      const t = now();
      const convId = convIdOf(tripId, ME, to);
      let c = db.convs.find(x => x.convId === convId);
      if (!c) {
        c = { _id: id('c'), convId, tripId, participants: [ME, to], labels: { [ME]: '我', [to]: '对方' }, createdAt: t };
        db.convs.unshift(c);
      }
      c.lastMsg = text;
      c.updatedAt = t;
      const m = { _id: id('m'), convId, tripId, from: ME, to, text, createdAt: t };
      db.msgs.push(m);
      save(db);
      return ok({ convId, msgId: m._id, createdAt: t });
    }
    case 'chatConversations': {
      const list = db.convs
        .filter(c => (c.participants || []).indexOf(ME) >= 0)
        .map(c => {
          const other = (c.participants || []).find(x => x !== ME) || '';
          const readAt = db.readState[c.convId] || 0;
          const unread = db.msgs.filter(m => m.convId === c.convId && m.to === ME && m.createdAt > readAt).length;
          return Object.assign({}, c, {
            otherOpenid: other,
            otherName: (c.labels && c.labels[other]) || '对方',
            unread,
            lastTimeText: formatTime(c.updatedAt)
          });
        })
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return { ok: true, list };
    }
    case 'chatMessages': {
      const { convId, before = 0, size = 30 } = event;
      let rows = db.msgs.filter(m => m.convId === convId);
      if (before > 0) rows = rows.filter(m => m.createdAt < before);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      const list = rows.slice(0, size).map(m => Object.assign({}, m, {
        mine: m.from === ME, timeText: formatTime(m.createdAt)
      }));
      return { ok: true, list, hasMore: rows.length > size };
    }
    case 'chatReadMark':
      db.readState[event.convId] = now();
      save(db);
      return { ok: true };
    default:
      return { ok: false, list: [] };
  }
}

function mockCall({ name, data = {} } = {}) {
  const db = load();
  let result;
  if (name === 'login') result = { openid: ME };
  else if (name === 'subscribeNotify') result = { ok: true };
  else if (name === 'trip') result = handleTrip(db, data);
  else if (name === 'demand') result = handleDemand(db, data);
  else result = handleChat(name, db, data);
  // 模拟网络延迟，让 loading / 乐观更新表现真实
  return new Promise(resolve => setTimeout(() => resolve({ result }), 120));
}

function install() {
  if (!wx.cloud) wx.cloud = {};
  wx.cloud.callFunction = mockCall;
  console.info('[顺路捎] 演示模式已开启：数据存本地，不连接云端');
}

module.exports = { install, reset, ME };
