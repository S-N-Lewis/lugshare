// pages/orders/orders.js
const tripService = require('../../services/trip.js');
const demandService = require('../../services/demand.js');
const { STATUS_TEXT } = require('../../utils/constants.js');
const { formatDate } = require('../../utils/format.js');

Page({
  data: {
    tab: 'posted',   // posted 我发布的 | joined 我参与的
    posted: [],
    joined: [],
    loading: true
  },

  onLoad() { this.loadAll(); },
  onShow() {
    if (wx.getStorageSync('needRefreshOrders')) {
      wx.removeStorageSync('needRefreshOrders');
      this.loadAll();
    }
  },
  onPullDownRefresh() { this.loadAll(() => wx.stopPullDownRefresh()); },

  async loadAll(cb) {
    this.setData({ loading: true });
    try {
      const [postedRes, joinedRes] = await Promise.all([
        tripService.mine(),
        demandService.mine()
      ]);
      const posted = postedRes.list.map(t => Object.assign({}, t, {
        statusLabel: STATUS_TEXT[t.status] || t.status,
        dateText: t.departDate,
        remainKg: Math.max(0, (Number(t.capacityKg) || 0) - (Number(t.usedKg) || 0))
      }));
      const joined = joinedRes.list.map(d => Object.assign({}, d, {
        statusLabel: STATUS_TEXT[d.status] || d.status,
        dateText: formatDate(d.createdAt)
      }));
      this.setData({ posted, joined, loading: false });
    } catch (e) {
      console.error('加载行程失败', e);
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      cb && cb();
    }
  },

  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  },

  goPublish() { wx.switchTab({ url: '/pages/publish/publish' }); },
  goHall() { wx.switchTab({ url: '/pages/index/index' }); },
  copyGreeting(e) {
    const text = e.currentTarget.dataset.text || '';
    if (text) wx.setClipboardData({ data: text });
  }
});
