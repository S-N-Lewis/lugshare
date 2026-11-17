#!/usr/bin/env node
/**
 * 顺路捎 · 生成真机预览二维码（不装微信开发者工具的路径）
 *
 * 前置（一次性）：
 *   1. 公众平台 → 开发管理 → 开发设置 → 生成「小程序代码上传密钥」，下载为 private.key
 *      放到本目录；若开启了 IP 白名单，把当前公网 IP 加进去（或直接关闭白名单）
 *   2. project.config.json 里的 appid 换成真实 AppID
 *   3. npm i（安装 miniprogram-ci；若已装可跳过）
 *
 * 用法：node 预览二维码.mjs
 * 输出：preview-qrcode.jpg，微信扫码即可真机运行
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
if (!cfg.appid || cfg.appid === 'touristappid') {
  console.error('❌ 请先把 project.config.json 里的 appid 换成真实 AppID');
  process.exit(1);
}

const keyPath = process.env.MP_PRIVATE_KEY || path.join(ROOT, 'private.key');
if (!fs.existsSync(keyPath)) {
  console.error('❌ 未找到代码上传密钥 private.key');
  console.error('   公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥 → 下载，放到本目录');
  console.error('   或用环境变量指定：MP_PRIVATE_KEY=/path/to/private.key node 预览二维码.mjs');
  process.exit(1);
}

let ci;
try {
  ci = require('miniprogram-ci');
} catch (e) {
  console.error('❌ 缺少 miniprogram-ci，请在本目录执行：npm i');
  process.exit(1);
}

const project = new ci.Project({
  appid: cfg.appid,
  type: 'miniProgram',
  projectPath: path.join(ROOT, 'miniprogram'),
  privateKeyPath: keyPath,
  ignores: ['node_modules/**/*', 'cloudfunctions/**/*']
});

const out = path.join(ROOT, 'preview-qrcode.jpg');
console.log('\n正在生成预览二维码…\n');

ci.preview({
  project,
  desc: '顺路捎 · 本地预览',
  setting: { es6: true, minify: false },
  qrcodeFormat: 'image',
  qrcodeOutputDest: out,
  onProgressUpdate: (t) => process.stdout.write('  ' + String(t || '').replace(/\n/g, ' ') + '\r')
}).then(() => {
  console.log('\n\n✅ 二维码已生成：' + out);
  console.log('   用微信扫码即可在真机上运行（开发版仅管理员/开发者可用；');
  console.log('   要让朋友用，去公众平台 → 成员管理 → 体验成员 加他们的微信号）。\n');
}).catch((e) => {
  console.error('\n❌ 生成失败：', (e && e.message) || e);
  console.error('   常见原因：密钥与 AppID 不匹配、IP 白名单未放行、appid 无权限、网络超时。');
  process.exit(1);
});
