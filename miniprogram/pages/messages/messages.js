// pages/messages/messages.js
const chatService = require('../../services/chat.js');

Page({
  data: {
    list: [],
    loading: true,
    poller: null
  },

  async onLoad() {
    try { await getApp().ensureLogin(); } catch (e) {}
    this.startPoll();
  },

  onUnload() { this.stopPoll(); },
  onHide() { this.stopPoll(); },
  onShow() {
    if (!this.data.poller) this.startPoll();
  },

  startPoll() {
    const poller = chatService.createPoller(
      () => chatService.conversations().then(r => (r.ok ? r.list : [])),
      list => this.setData({ list, loading: false }),
      4000
    );
    this.setData({ poller });
  },
  stopPoll() {
    if (this.data.poller) {
      this.data.poller.close();
      this.setData({ poller: null });
    }
  },

  openChat(e) {
    const { convid, tripid, to, name, route } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/chat/chat?convId=${convid}&tripId=${tripid}&to=${to}&name=${encodeURIComponent(name || '对方')}&route=${encodeURIComponent(route || '')}`
    });
  },

  goHall() { wx.switchTab({ url: '/pages/index/index' }); }
});
