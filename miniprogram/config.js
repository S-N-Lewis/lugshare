// config.js - 运行模式开关
//
// USE_MOCK = true  → 演示模式：不连云端、不部署云函数，数据存本机 Storage，
//                     打开即可跑通发布/报名/状态/聊天全部流程（适合先验证产品）
// USE_MOCK = false → 真实云开发：走 wx.cloud.callFunction，需开通云开发并部署 8 个云函数
//
// 切换后重新编译即可生效。演示模式的数据可用 wx.removeStorageSync('MOCK_DB_V1') 重置。
module.exports = {
  USE_MOCK: true
};
