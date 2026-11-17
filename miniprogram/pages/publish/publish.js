// pages/publish/publish.js
const tripService = require('../../services/trip.js');
const { validateText, required, isValidDate } = require('../../utils/validate.js');
const { COMPLIANCE_TEXT, ITEM_CATEGORIES, LIABILITY_OPTIONS } = require('../../utils/constants.js');

Page({
  data: {
    form: {
      fromCity: '', toCity: '', departDate: '', deadline: '', flightNo: '',
      capacityKg: '', pricePerKg: '', minFee: '',
      pickupAddress: '', note: '', routeNote: '', contactWx: '',
      acceptedItems: [], rejectedItems: [], liabilities: [],
      nickName: '', avatarUrl: ''
    },
    categories: ITEM_CATEGORIES,
    liabilityOptions: LIABILITY_OPTIONS,
    complianceText: COMPLIANCE_TEXT,
    agreed: false,
    submitting: false
  },

  onLoad() {
    const app = getApp();
    if (app.globalData.profile) {
      this.setData({
        'form.nickName': app.globalData.profile.nickName || '',
        'form.avatarUrl': app.globalData.profile.avatarUrl || ''
      });
    }
  },

  onField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onDate(e) { this.setData({ 'form.departDate': e.detail.value }); },
  onDeadline(e) { this.setData({ 'form.deadline': e.detail.value }); },

  // 品类/责任条款多选：dataset.kind 决定写入哪个数组
  toggleOption(e) {
    const { kind, key } = e.currentTarget.dataset;
    const arr = this.data.form[kind].slice();
    const idx = arr.indexOf(key);
    if (idx >= 0) arr.splice(idx, 1); else arr.push(key);
    this.setData({ [`form.${kind}`]: arr });
  },

  onAgree() { this.setData({ agreed: !this.data.agreed }); },

  async onSubmit() {
    if (this.data.submitting) return;
    const f = this.data.form;

    // 本地校验
    let err = required(f.fromCity, '出发城市') || required(f.toCity, '到达城市');
    if (err) return this.tip(err);
    if (!isValidDate(f.departDate)) return this.tip('请选择出发日期');
    if (!f.capacityKg || Number(f.capacityKg) <= 0) return this.tip('请填写可捎带重量');
    if (f.pricePerKg && Number(f.pricePerKg) < 0) return this.tip('计费单价不能为负');
    if (f.capacityKg && Number(f.capacityKg) > 100) return this.tip('单次可捎带重量请不超过 100kg');
    err = validateText(f.note, '备注') || validateText(f.routeNote, '路线说明');
    if (err) return this.tip(err);
    if (!this.data.agreed) return this.tip('请先阅读并勾选合规承诺');

    this.setData({ submitting: true });
    wx.showLoading({ title: '发布中' });
    try {
      await getApp().ensureLogin();
      // 从 profile 兜底昵称头像
      const profile = getApp().globalData.profile || {};
      const payload = Object.assign({}, f, {
        nickName: f.nickName || profile.nickName || '匿名用户',
        avatarUrl: f.avatarUrl || profile.avatarUrl || '',
        compliance: true
      });
      await tripService.publish(payload);
      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });
      wx.setStorageSync('needRefreshIndex', true);
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 800);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '发布失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  tip(msg) { wx.showToast({ title: msg, icon: 'none' }); }
});
