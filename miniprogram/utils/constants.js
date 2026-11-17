// utils/constants.js - 常量与枚举

// 行程状态
const TRIP_STATUS = {
  OPEN: 'open',       // 招募中
  CLOSED: 'closed'    // 已关闭（人已到/额度已满）
};

// 需求状态（状态机）
const DEMAND_STATUS = {
  PENDING: 'pending',       // 待带货人确认
  ACCEPTED: 'accepted',     // 已确认，待交付
  SHIPPED: 'shipped',       // 已寄出/已交付给带货人
  IN_TRANSIT: 'in_transit', // 已随行在途
  DELIVERED: 'delivered',   // 已送达收件人
  REJECTED: 'rejected',     // 带货人拒绝
  CANCELLED: 'cancelled'    // 求带人撤回
};

const STATUS_TEXT = {
  [TRIP_STATUS.OPEN]: '招募中',
  [TRIP_STATUS.CLOSED]: '已关闭',
  [DEMAND_STATUS.PENDING]: '待确认',
  [DEMAND_STATUS.ACCEPTED]: '已确认',
  [DEMAND_STATUS.SHIPPED]: '已寄出',
  [DEMAND_STATUS.IN_TRANSIT]: '在途中',
  [DEMAND_STATUS.DELIVERED]: '已送达',
  [DEMAND_STATUS.REJECTED]: '已拒绝',
  [DEMAND_STATUS.CANCELLED]: '已撤回'
};

// 取货方式
const PICKUP_TYPE = {
  SELF: 'self',   // 自取/当面交接
  MAIL: 'mail'    // 邮寄到带货人处
};

// 合成违禁品词库（命中即拦截，防止发布明显违规内容）
// 完整规则以海关与航司最新规定为准，本词库仅做基础拦截
const BANNED_KEYWORDS = [
  '毒品', '海洛因', '冰毒', '大麻', '可卡因',
  '枪支', '弹药', '爆炸物', '炸药', '雷管',
  '管制刀具', '刀具', '匕首',
  '走私', '代购牟利', '逃税', '避税',
  '活体', '宠物走私', '濒危', '象牙', '犀牛角',
  '易燃易爆', '汽油', '酒精燃料'
];

// 合规承诺文案（发布页强制勾选）
const COMPLIANCE_TEXT = '我承诺：所托物品不含违禁品，不用于商业代购/走私等牟利行为，遵守出发地与目的地海关及航司规定，如实申报；相关费用由双方线下自行结清，本小程序不代收代付。';

// 可带 / 不可带品类预设（借鉴小红书捎带一线经验：品类说清楚能省掉大量来回追问）
const ITEM_CATEGORIES = [
  { key: 'docs', label: '证件文件', ok: true },
  { key: 'meds', label: '常用药品', ok: true },
  { key: 'food', label: '零食干货', ok: null },   // null = 视目的地规定而定
  { key: 'daily', label: '日用百货', ok: true },
  { key: 'electronics', label: '电子产品', ok: null },
  { key: 'cosmetics', label: '护肤化妆品', ok: null },
  { key: 'liquid', label: '液体粉末', ok: false },
  { key: 'fresh', label: '生鲜肉蛋', ok: false }
];

// 责任条款预设（借鉴自真实捎带帖，用户选人的核心依据）
const LIABILITY_OPTIONS = [
  '被税自付', '罚没自担', '不垫付', '丢损自负', '仅供自用品'
];

// 生成一键招呼语（借鉴 xhs-shaodai：第一句就给全信息，省一个来回）
function buildGreeting(itemName, estKg, fromCity, toCity) {
  const parts = [];
  if (fromCity) parts.push(`从${fromCity}寄${toCity ? '到' + toCity : ''}`);
  if (itemName) parts.push(itemName);
  if (estKg) parts.push(`大概${estKg}kg`);
  const what = parts.length ? parts.join('，') : '一些东西';
  return `你好，还接顺路捎带吗？我想${what}。物品合规、非商业代购，费用线下结清。`;
}

module.exports = {
  TRIP_STATUS,
  DEMAND_STATUS,
  STATUS_TEXT,
  PICKUP_TYPE,
  BANNED_KEYWORDS,
  COMPLIANCE_TEXT,
  ITEM_CATEGORIES,
  LIABILITY_OPTIONS,
  buildGreeting
};
