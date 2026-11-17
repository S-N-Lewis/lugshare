// pages/detail/detail.js
const tripService = require('../../services/trip.js');
const demandService = require('../../services/demand.js');
const chatService = require('../../services/chat.js');
const notifyService = require('../../services/notify.js');
const { requestApplicantSubscribe, requestPublisherSubscribe, requestMessageSubscribe } = require('../../utils/subscribe-tmpl.js');
const { validateText, required } = require('../../utils/validate.js');
const { COMPLIANCE_TEXT, STATUS_TEXT, DEMAND_STATUS, PICKUP_TYPE, ITEM_CATEGORIES, buildGreeting } = require('../../utils/constants.js');

// 品类 key -> label 映射
const CATEGORY_LABEL = {};
ITEM_CATEGORIES.forEach(c => { CATEGORY_LABEL[c.key] = c.label; });
const { formatTime, money } = require('../../utils/format.js');

Page({
  data: {
    id: '',
    trip: null,
    myOpenid: '',
    isOwner: false,        // 当前用户是否带货人
    demands: [],           // 带货人视角的需求列表
    statusText: STATUS_TEXT,
    showApply: false,      // 报名弹层
    complianceText: COMPLIANCE_TEXT,
    agreed: false,
    applying: false,
    remainKg: 0,
    percent: 0,
    apply: {
      itemName: '', estKg: '', pickupType: 'self',
      address: '', expressNo: '', note: '',
      nickName: '', avatarUrl: ''
    }
  },

  async onLoad(options) {
    this.setData({ id: options.id || '' });
    try {
      const openid = await getApp().ensureLogin();
      this.setData({ myOpenid: openid });
    } catch (e) {
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
    const profile = getApp().globalData.profile || {};
    this.setData({
      'apply.nickName': profile.nickName || '',
      'apply.avatarUrl': profile.avatarUrl || ''
    });
    await this.loadTrip();
  },

  async loadTrip() {
    try {
      const t = await tripService.detail(this.data.id);
      const capacity = Number(t.capacityKg) || 0;
      const used = Number(t.usedKg) || 0;
      const remain = Math.max(0, capacity - used);
      const percent = capacity > 0 ? Math.min(100, Math.round(used / capacity * 100)) : 0;
      const isOwner = t.openid === this.data.myOpenid;
      // 品类 key 转中文标签
      const acceptedText = (t.acceptedItems || []).map(k => CATEGORY_LABEL[k]).filter(Boolean).join('、');
      const rejectedText = (t.rejectedItems || []).map(k => CATEGORY_LABEL[k]).filter(Boolean).join('、');
      const view = Object.assign({}, t, { acceptedText, rejectedText });
      this.setData({ trip: view, isOwner, remainKg: Math.round(remain * 10) / 10, percent });
      if (isOwner) this.loadDemands();
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  async loadDemands() {
    try {
      const res = await demandService.listByTrip(this.data.id);
      const list = res.list.map(d => Object.assign({}, d, {
        statusLabel: STATUS_TEXT[d.status] || d.status,
        estKgText: d.estKg ? Number(d.estKg).toFixed(1) : '0',
        createdText: formatTime(d.createdAt)
      }));
      this.setData({ demands: list });
    } catch (e) {
      console.error('加载需求失败', e);
    }
  },

  // ---- 求带人：报名 ----
  openApply() {
    if (!this.data.trip || this.data.trip.status !== 'open') {
      return wx.showToast({ title: '该行程已关闭接单', icon: 'none' });
    }
    this.setData({ showApply: true });
  },
  closeApply() { this.setData({ showApply: false }); },
  onApplyField(e) {
    const key = e.currentTarget.dataset.key;
    const patch = { [`apply.${key}`]: e.detail.value };
    // 物品名/重量变化时实时刷新招呼语
    if (key === 'itemName' || key === 'estKg') {
      const a = this.data.apply;
      const name = key === 'itemName' ? e.detail.value : a.itemName;
      const kg = key === 'estKg' ? e.detail.value : a.estKg;
      patch.greeting = buildGreeting(name, kg, this.data.trip.fromCity, this.data.trip.toCity);
    }
    this.setData(patch);
  },
  onPickupChange(e) { this.setData({ 'apply.pickupType': PICKUP_TYPE[e.currentTarget.dataset.type] }); },
  onAgree() { this.setData({ agreed: !this.data.agreed }); },
  copyGreeting() {
    const g = this.data.apply.greeting || buildGreeting(this.data.apply.itemName, this.data.apply.estKg, this.data.trip.fromCity, this.data.trip.toCity);
    if (!g) return this.tip('先填写物品信息');
    wx.setClipboardData({ data: g });
  },

  // 发起/进入聊天：会话 ID 确定性生成，本地标记避免重复发招呼语
  async startChat(toOpenid, toName, firstText) {
    if (!toOpenid) return this.tip('无法联系该用户');
    if (toOpenid === this.data.myOpenid) return this.tip('不能和自己聊天');
    const tripId = this.data.id;
    const convId = chatService.convIdOf(tripId, this.data.myOpenid, toOpenid);
    const startedKey = 'chat_started_' + convId;
    // 手势内授权：对方回复时我能收到提醒
    const authKey = 'sub_msg_auth_chat';
    if (!wx.getStorageSync(authKey)) {
      await requestMessageSubscribe();
      wx.setStorageSync(authKey, true);
    }
    if (!wx.getStorageSync(startedKey)) {
      wx.showLoading({ title: '建立会话' });
      try {
        const greeting = firstText || '你好，我想咨询这个行程，方便聊聊吗？';
        const r = await chatService.send(tripId, toOpenid, greeting);
        wx.hideLoading();
        if (!r.ok) return this.tip(r.msg || '发起会话失败');
        wx.setStorageSync(startedKey, true);
        // 通知对方收到新消息（旁路）
        const profile = (getApp().globalData.profile || {}).nickName || toName;
        notifyService.newMessage(tripId, toOpenid, greeting, convId, profile);
      } catch (e) {
        wx.hideLoading();
        return this.tip('发起会话失败，请重试');
      }
    }
    const route = `${this.data.trip.fromCity || ''}→${this.data.trip.toCity || ''}`;
    wx.navigateTo({
      url: `/pages/chat/chat?convId=${convId}&tripId=${tripId}&to=${toOpenid}&name=${encodeURIComponent(toName)}&route=${encodeURIComponent(route)}`
    });
  },

  // 求带人 → 联系带货人
  onContactOwner() {
    const t = this.data.trip;
    const first = buildGreeting(this.data.apply.itemName, this.data.apply.estKg, t.fromCity, t.toCity);
    this.startChat(t.openid, t.ownerNick || '带货人', first);
  },

  // 带货人 → 联系某个报名者
  onContactApplicant(e) {
    const d = e.currentTarget.dataset;
    const t = this.data.trip;
    const first = `你好，关于${t.fromCity}→${t.toCity}的行程，你报名的${d.item || '物品'}我已收到，我们聊聊交接细节。`;
    this.startChat(d.openid, d.name || '求带人', first);
  },

  async submitApply() {
    if (this.data.applying) return;
    const a = this.data.apply;
    let err = required(a.itemName, '物品名称');
    if (err) return this.tip(err);
    if (!a.estKg || Number(a.estKg) <= 0) return this.tip('请填写预估重量');
    if (Number(a.estKg) > this.data.remainKg) return this.tip(`剩余额度仅 ${this.data.remainKg}kg`);
    if (a.pickupType === 'mail' && !a.address) return this.tip('请填写邮寄地址');
    err = validateText(a.itemName, '物品名称') || validateText(a.note, '备注');
    if (err) return this.tip(err);
    if (!this.data.agreed) return this.tip('请先确认合规承诺');

    // 用户手势内申请订阅授权（一次性订阅：授权后可收到报名结果与新消息提醒）
    await requestApplicantSubscribe();

    this.setData({ applying: true });
    wx.showLoading({ title: '提交中' });
    try {
      const submitted = await demandService.submit({
        tripId: this.data.id,
        itemName: a.itemName,
        estKg: Number(a.estKg),
        pickupType: a.pickupType,
        address: a.address,
        expressNo: a.expressNo,
        note: a.note,
        greeting: a.greeting || buildGreeting(a.itemName, a.estKg, this.data.trip.fromCity, this.data.trip.toCity),
        nickName: a.nickName,
        avatarUrl: a.avatarUrl,
        compliance: true
      });
      // 通知带货人"收到新报名"（旁路，失败不影响报名成功）
      const demandId = submitted && submitted.id;
      if (demandId) notifyService.newApply(this.data.id, demandId);
      wx.hideLoading();
      this.setData({ showApply: false, agreed: false });
      wx.setStorageSync('needRefreshOrders', true);
      // 报名成功后引导联系带货人（站内聊天，不暴露隐私联系方式）
      wx.showModal({
        title: '报名成功',
        content: '已通知带货人。要不要现在发条消息，把物品和交接细节说清楚？',
        confirmText: '去联系',
        cancelText: '稍后',
        success: (r) => {
          if (r.confirm) {
            const t = this.data.trip;
            const first = a.greeting || buildGreeting(a.itemName, a.estKg, t.fromCity, t.toCity);
            this.startChat(t.openid, t.ownerNick || '带货人', first);
          } else {
            wx.showToast({ title: '报名成功', icon: 'success' });
          }
        }
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ applying: false });
    }
  },

  // ---- 带货人：管理需求状态 ----
  onAccept(e) { this.updateDemand(e.currentTarget.dataset.id, 'accepted', '确认接单？确认后将占用额度'); },
  onReject(e) { this.updateDemand(e.currentTarget.dataset.id, 'rejected', '确认拒绝该需求？额度将释放'); },
  onShip(e)   { this.updateDemand(e.currentTarget.dataset.id, 'shipped', '确认物品已寄出/交付给带货人？'); },
  onTransit(e){ this.updateDemand(e.currentTarget.dataset.id, 'in_transit', '确认已随行在途？'); },
  onDeliver(e){ this.updateDemand(e.currentTarget.dataset.id, 'delivered', '确认已送达收件人？'); },

  updateDemand(id, status, tipText) {
    wx.showModal({
      title: '确认操作', content: tipText,
      success: async (r) => {
        if (!r.confirm) return;
        // 带货人在手势中续授权，便于后续收到新报名提醒
        await requestPublisherSubscribe();
        try {
          await demandService.updateStatus(id, status);
          // 确认/拒绝时通知求带人（旁路）
          if (status === 'accepted' || status === 'rejected') {
            const label = status === 'accepted' ? '已通过' : '未通过';
            notifyService.applyResult(this.data.id, id, label);
          }
          wx.showToast({ title: '已更新', icon: 'success' });
          await this.loadTrip();
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  // 求带人撤回
  onCancel(e) {
    this.updateDemand(e.currentTarget.dataset.id, 'cancelled', '确认撤回该需求？额度将释放');
  },

  async toggleTripStatus() {
    const next = this.data.trip.status === 'open' ? 'closed' : 'open';
    const tipText = next === 'closed' ? '关闭后将停止接收新报名，已确认的需求不受影响。确认关闭？' : '重新开放接单？';
    wx.showModal({
      title: '提示', content: tipText,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await tripService.updateStatus(this.data.id, next);
          wx.showToast({ title: '已更新', icon: 'success' });
          await this.loadTrip();
          wx.setStorageSync('needRefreshIndex', true);
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  copyText(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.text || '' });
  },

  noop() {},

  tip(msg) { wx.showToast({ title: msg, icon: 'none' }); },

  onShareAppMessage() {
    const t = this.data.trip || {};
    return {
      title: `${t.fromCity || ''}→${t.toCity || ''} 有空余行李额，顺路互助`,
      path: `/pages/detail/detail?id=${this.data.id}`
    };
  }
});
