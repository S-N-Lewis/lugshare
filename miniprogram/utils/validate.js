// utils/validate.js - 本地校验工具

const { BANNED_KEYWORDS } = require('./constants.js');

/**
 * 违禁词检测：返回命中的关键词数组（空数组表示通过）
 * 说明：这是前端第一道拦截，云函数侧仍需二次校验（防绕过）
 */
function checkBanned(text) {
  if (!text) return [];
  const s = String(text).toLowerCase();
  return BANNED_KEYWORDS.filter(word => s.indexOf(word.toLowerCase()) !== -1);
}

/**
 * 校验物品描述/备注，命中违禁词返回错误文案，否则返回 null
 */
function validateText(text, label = '内容') {
  const hits = checkBanned(text);
  if (hits.length) {
    return `${label}包含不宜发布的内容（${hits.slice(0, 3).join('、')}），请修改后再提交。如需携带特殊物品，请先确认是否符合海关与航司规定`;
  }
  return null;
}

/**
 * 表单必填校验
 */
function required(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return `请填写${label}`;
  }
  return null;
}

/**
 * 日期格式 YYYY-MM-DD
 */
function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str || '');
}

module.exports = { checkBanned, validateText, required, isValidDate };
