// pages/mine/mine.js
const { COMPLIANCE_TEXT } = require('../../utils/constants.js');

Page({
  data: {
    profile: null,
    complianceText: COMPLIANCE_TEXT,
    showCompliance: false,
    editing: false,
    editName: ''
  },

  onShow() {
    this.setData({ profile: getApp().globalData.profile });
  },

  onEdit() {
    this.setData({ editing: true, editName: (this.data.profile && this.data.profile.nickName) || '' });
  },
  onNameInput(e) { this.setData({ editName: e.detail.value }); },
  saveProfile() {
    const name = this.data.editName.trim();
    if (!name) return wx.showToast({ title: '请填写称呼', icon: 'none' });
    const profile = Object.assign({}, this.data.profile || {}, { nickName: name });
    getApp().saveProfile(profile);
    this.setData({ profile, editing: false });
    wx.showToast({ title: '已保存', icon: 'success' });
  },
  cancelEdit() { this.setData({ editing: false }); },

  showComplianceModal() { this.setData({ showCompliance: true }); },
  hideComplianceModal() { this.setData({ showCompliance: false }); },
  noop() {},

  goOrders() { wx.navigateTo({ url: '/pages/orders/orders' }); },
  goPublish() { wx.switchTab({ url: '/pages/publish/publish' }); },

  onShareAppMessage() {
    return { title: '顺路捎 — 顺路的行李额度，互助不浪费', path: '/pages/index/index' };
  }
});
