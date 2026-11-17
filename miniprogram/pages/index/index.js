// pages/index/index.js
const tripService = require('../../services/trip.js');

Page({
  data: {
    fromCity: '',
    toCity: '',
    date: '',
    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    initDone: false
  },

  onLoad() {
    this.loadList(true);
  },

  onShow() {
    // 从发布页返回时刷新（轻量：仅当有新发布标记时）
    const flag = wx.getStorageSync('needRefreshIndex');
    if (flag) {
      wx.removeStorageSync('needRefreshIndex');
      this.loadList(true);
    }
  },

  onPullDownRefresh() {
    this.loadList(true, () => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.loadList(false);
    }
  },

  async loadList(refresh = false, cb) {
    if (this.data.loading) { cb && cb(); return; }
    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });
    try {
      const res = await tripService.list({
        fromCity: this.data.fromCity.trim(),
        toCity: this.data.toCity.trim(),
        date: this.data.date,
        page,
        size: 10
      });
      const list = refresh ? res.list : this.data.list.concat(res.list);
      this.setData({
        list,
        hasMore: res.hasMore,
        page,
        initDone: true,
        loading: false
      });
    } catch (e) {
      console.error('加载行程失败', e);
      this.setData({ initDone: true, loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      cb && cb();
    }
  },

  onFromInput(e) { this.setData({ fromCity: e.detail.value }); },
  onToInput(e) { this.setData({ toCity: e.detail.value }); },
  onDateChange(e) { this.setData({ date: e.detail.value }); },
  onSearch() { this.loadList(true); },
  resetFilter() {
    this.setData({ fromCity: '', toCity: '', date: '' });
    this.loadList(true);
  },

  onTripTap(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}` });
  },

  goPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
  },

  onShareAppMessage() {
    return {
      title: '顺路捎 — 顺路的行李额度，互助不浪费',
      path: '/pages/index/index'
    };
  }
});
