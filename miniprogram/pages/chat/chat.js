// pages/chat/chat.js
const chatService = require('../../services/chat.js');
const notifyService = require('../../services/notify.js');
const { requestMessageSubscribe } = require('../../utils/subscribe-tmpl.js');

Page({
  data: {
    convId: '',
    tripId: '',
    to: '',
    toName: '对方',
    route: '',
    msgs: [],          // 按时间正序，直接渲染
    input: '',
    sending: false,
    scrollTop: 0,
    poller: null,
    hasMore: true,
    loadingMore: false
  },

  onLoad(options) {
    this.setData({
      convId: options.convId || '',
      tripId: options.tripId || '',
      to: options.to || '',
      toName: decodeURIComponent(options.name || '对方'),
      route: decodeURIComponent(options.route || '')
    });
    wx.setNavigationBarTitle({ title: this.data.toName });
    this.loadMessages();
    this.markRead();
    this.startPoll();
  },

  onUnload() { this.stopPoll(); },
  onHide() { this.stopPoll(); },
  onShow() {
    if (!this.data.poller && this.data.convId) {
      this.startPoll();
      this.markRead();
    }
  },

  async loadMessages(before = 0) {
    if (this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      const r = await chatService.messages(this.data.convId, before, 30);
      if (r.ok && r.list) {
        // 云端按 createdAt 倒序返回，本地翻转成正序
        const older = r.list.slice().reverse();
        const msgs = before > 0 ? older.concat(this.data.msgs) : older;
        this.setData({ msgs, hasMore: r.hasMore });
        if (before === 0) this.scrollToBottom();
      }
    } catch (e) {
      console.error('加载消息失败', e);
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  loadOlder() {
    if (!this.data.hasMore || this.data.msgs.length === 0) return;
    const oldest = this.data.msgs[0].createdAt;
    this.loadMessages(oldest);
  },

  startPoll() {
    const convId = this.data.convId;
    if (!convId) return;
    const poller = chatService.createPoller(
      () => chatService.messages(convId, 0, 30).then(r => (r.ok ? r.list : [])),
      rows => {
        const incoming = rows.slice().reverse();
        // 用 _id 去重合并（乐观消息以 temp_ 开头，服务端返回后替换）
        const map = {};
        this.data.msgs.forEach(m => {
          if (!m._id.startsWith('temp_')) map[m._id] = m;
        });
        incoming.forEach(m => { map[m._id] = m; });
        const merged = Object.values(map).sort((a, b) => a.createdAt - b.createdAt);
        this.setData({ msgs: merged });
        this.scrollToBottom();
        this.markRead();
      },
      3000
    );
    this.setData({ poller });
  },
  stopPoll() {
    if (this.data.poller) { this.data.poller.close(); this.setData({ poller: null }); }
  },

  markRead() {
    if (!this.data.convId) return;
    chatService.markRead(this.data.convId).catch(() => {});
  },

  onInput(e) { this.setData({ input: e.detail.value }); },

  async send() {
    const text = this.data.input.trim();
    if (!text || this.data.sending) return;
    this.setData({ input: '', sending: true });

    // 用户手势内申请授权：授权后，对方回复时我能收到提醒（一次性订阅）
    const authKey = 'sub_msg_auth_chat';
    if (!wx.getStorageSync(authKey)) {
      await requestMessageSubscribe();
      wx.setStorageSync(authKey, true);
    }

    // 乐观更新：先插入一条 temp 消息
    const tempId = 'temp_' + Date.now();
    const tempMsg = { _id: tempId, from: 'me', text, createdAt: Date.now(), mine: true, timeText: nowTime(), pending: true };
    this.setData({ msgs: this.data.msgs.concat([tempMsg]) }, () => this.scrollToBottom());

    try {
      const r = await chatService.send(this.data.tripId, this.data.to, text);
      if (r.ok) {
        // 发送成功：把 temp 替换成服务端返回的真实消息（轮询也会拉到，这里先移除 temp）
        this.setData({ msgs: this.data.msgs.filter(m => m._id !== tempId) });
        // 通知对方"收到新消息"（旁路）。昵称从本地资料取
        const profile = (getApp().globalData.profile || {}).nickName || '对方';
        notifyService.newMessage(this.data.tripId, this.data.to, text, this.data.convId, profile);
      } else {
        this.markFailed(tempId, r.msg || '发送失败');
      }
    } catch (e) {
      this.markFailed(tempId, '发送失败');
    } finally {
      this.setData({ sending: false });
    }
  },

  markFailed(tempId, reason) {
    this.setData({
      msgs: this.data.msgs.map(m => m._id === tempId ? Object.assign({}, m, { failed: true, pending: false, reason }) : m)
    });
  },

  retryFail(e) {
    const id = e.currentTarget.dataset.id;
    const msg = this.data.msgs.find(m => m._id === id);
    if (!msg) return;
    this.setData({ msgs: this.data.msgs.filter(m => m._id !== id), input: msg.text });
  },

  scrollToBottom() {
    this.setData({ scrollTop: this.data.msgs.length * 1000 + 10000 });
  }
});

function nowTime() {
  const d = new Date();
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
