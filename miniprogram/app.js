// app.js
const config = require('./config.js');

App({
  globalData: {
    openid: '',
    // 云环境 ID：留空表示使用默认环境；如有多个环境，填具体 env id
    envId: '',
    // 用户配置（头像昵称等轻量信息，非微信隐私接口获取）
    profile: null
  },

  onLaunch() {
    if (config.USE_MOCK) {
      // 演示模式：拦截云函数调用，数据全部存本机，无需开通云开发
      require('./utils/mock-cloud.js').install();
    } else {
      this.initCloud();
    }
    this.restoreProfile();
  },

  // 初始化云开发
  initCloud() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发，请将调试基础库调至 2.2.3 以上');
      return;
    }
    try {
      const opt = this.globalData.envId ? { env: this.globalData.envId } : {};
      wx.cloud.init({ ...opt, traceUser: true });
    } catch (e) {
      console.error('云开发初始化失败', e);
    }
  },

  // 从本地缓存恢复用户资料
  restoreProfile() {
    try {
      const profile = wx.getStorageSync('profile');
      if (profile) this.globalData.profile = profile;
    } catch (e) {
      console.warn('读取本地资料失败', e);
    }
  },

  // 保存用户资料到缓存
  saveProfile(profile) {
    this.globalData.profile = profile;
    try {
      wx.setStorageSync('profile', profile);
    } catch (e) {
      console.warn('保存本地资料失败', e);
    }
  },

  // 静默登录：换取 openid（不弹授权，不采集隐私信息）
  async ensureLogin() {
    if (this.globalData.openid) return this.globalData.openid;
    try {
      const res = await wx.cloud.callFunction({ name: 'login' });
      const openid = res.result && res.result.openid;
      if (openid) {
        this.globalData.openid = openid;
        return openid;
      }
      throw new Error('未获取到 openid');
    } catch (e) {
      console.error('登录失败', e);
      throw e;
    }
  }
});
