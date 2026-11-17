#!/usr/bin/env node
/**
 * 顺路捎 · 云端一键部署
 *
 * 作用：不装微信开发者工具，用 CloudBase CLI 把后端一次性部署好
 *   1) 检查环境 ID 与登录状态
 *   2) 部署 8 个云函数（云端自动安装 wx-server-sdk）
 *   3) 创建 6 个数据库集合
 *   4) 输出验证结果
 *
 * 用法：
 *   tcb login                 # 首次：浏览器/设备码扫码授权（只需一次）
 *   node 云端部署.mjs          # 之后每次改代码，重跑即可
 *
 * 前置：把 cloudbaserc.json 里的 REPLACE_WITH_YOUR_ENV_ID 换成真实环境 ID
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COLLECTIONS = [
  'users', 'trips', 'demands',
  'chat_conversations', 'chat_messages', 'chat_read_state'
];

function run(args, { quiet = false } = {}) {
  const r = spawnSync('tcb', args, {
    cwd: ROOT, encoding: 'utf8', shell: true, timeout: 180000
  });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  if (!quiet && out) console.log(indent(out));
  return { code: r.status, out };
}
function indent(s) { return s.split('\n').slice(0, 12).map(l => '    ' + l).join('\n'); }
function ok(m) { console.log('  ✅ ' + m); }
function warn(m) { console.log('  ⚠️  ' + m); }

console.log('\n=== 顺路捎 · 云端部署 ===\n');

// 1. 前置检查
console.log('[1/4] 检查配置');
const ver = run(['-v'], { quiet: true });
if (ver.code !== 0) {
  console.error('  ❌ 未找到 tcb 命令，请先执行：npm i -g @cloudbase/cli');
  process.exit(1);
}
ok('CloudBase CLI 已安装');

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'cloudbaserc.json'), 'utf8'));
if (!cfg.envId || cfg.envId.includes('REPLACE_WITH')) {
  console.error('  ❌ 请先把 cloudbaserc.json 里的 envId 换成真实环境 ID');
  console.error('     （CloudBase 控制台 → 环境概览，或用 tcb env list 查看）');
  process.exit(1);
}
ok('环境 ID：' + cfg.envId);

// 2. 登录状态
console.log('\n[2/4] 检查登录');
const envList = run(['env', 'list', '--json'], { quiet: true });
if (envList.code !== 0 || /not login|未登录|please login|Unauthorized/i.test(envList.out)) {
  console.error('  ❌ 尚未登录。请先执行 tcb login 完成扫码授权，再重跑本脚本。');
  process.exit(1);
}
ok('已登录 CloudBase');
if (envList.out) console.log(indent(envList.out));

// 3. 部署云函数
console.log('\n[3/4] 部署 8 个云函数（云端安装依赖，约 3–8 分钟）');
const deploy = run(['fn', 'deploy', '--all', '--force', '--install-dependency', 'true']);
if (deploy.code !== 0) {
  console.error('  ❌ 云函数部署失败。常见原因：环境 ID 填错、未开通云开发、网络超时。');
  console.error('     可单独重试：tcb fn deploy login --force');
  process.exit(1);
}
ok('云函数部署完成');

// 4. 建集合
console.log('\n[4/4] 创建 6 个数据库集合');
for (const name of COLLECTIONS) {
  const create = JSON.stringify([{
    TableName: name,
    CommandType: 'COMMAND',
    Command: JSON.stringify({ create: name })
  }]);
  let r = run(['db', 'nosql', 'execute', '--command', shellQuote(create), '--json'], { quiet: true });

  if (r.code !== 0 || /error|fail|invalid/i.test(r.out)) {
    // 兜底：文档库插入第一条数据会自动建集合，随后删掉
    const insert = JSON.stringify([{
      TableName: name,
      CommandType: 'INSERT',
      Command: JSON.stringify({ insert: name, documents: [{ _init: true }] })
    }]);
    const del = JSON.stringify([{
      TableName: name,
      CommandType: 'DELETE',
      Command: JSON.stringify({ delete: name, deletes: [{ q: { _init: true }, limit: 0 }] })
    }]);
    const r2 = run(['db', 'nosql', 'execute', '--command', shellQuote(insert), '--json'], { quiet: true });
    if (r2.code === 0) {
      run(['db', 'nosql', 'execute', '--command', shellQuote(del), '--json'], { quiet: true });
      ok(name + '（用插入方式创建）');
    } else {
      warn(name + ' 创建失败：' + (r2.out || '未知错误').slice(0, 160));
    }
  } else {
    ok(name);
  }
}
function shellQuote(s) { return "'" + s.replace(/'/g, "'\\''") + "'"; }

// 验证
console.log('\n=== 验证 ===');
const fnList = run(['fn', 'list'], { quiet: true });
const missing = cfg.functions.filter(f => !(fnList.out || '').includes(f.name)).map(f => f.name);
if (missing.length) warn('以下云函数未在列表中确认：' + missing.join(', '));
else ok('8 个云函数全部就位');

console.log('\n后端部署完成 ✅');
console.log('下一步：用微信开发者工具（或 miniprogram-ci）编译前端并扫码预览。');
console.log('详见《免费试跑清单.md》。\n');
