#!/usr/bin/env node
/**
 * 顺路捎 · 填入两个 ID 并部署
 *
 * 用法：
 *   node 配置并部署.mjs <AppID> <环境ID>
 *   例：node 配置并部署.mjs wx1234567890abcdef cloud1-3gxxxxxxxxxx
 *
 * 作用：
 *   1) 把 AppID 写进 project.config.json
 *   2) 把环境 ID 写进 cloudbaserc.json
 *   3) 校验 tcb 登录状态
 *   4) 调用 云端部署.mjs 完成 8 云函数 + 6 集合
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [appid, envId] = process.argv.slice(2);

if (!appid || !envId) {
  console.error('用法：node 配置并部署.mjs <AppID> <环境ID>');
  console.error('例：node 配置并部署.mjs wx1234567890abcdef cloud1-3gxxxxxxxxxx');
  process.exit(1);
}
if (!/^wx[a-f0-9]{16}$/i.test(appid)) {
  console.error('❌ AppID 格式不对：应为 wx 开头 + 16 位十六进制，共 18 位');
  process.exit(1);
}

function patch(file, key, value) {
  const p = path.join(ROOT, file);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j[key] = value;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  console.log('  ✅ ' + file + ' → ' + key + ' = ' + value);
}

console.log('\n=== 写入配置 ===');
patch('project.config.json', 'appid', appid);
patch('cloudbaserc.json', 'envId', envId);

console.log('\n=== 校验登录 ===');
const r = spawnSync('tcb', ['env', 'list', '--json'], { cwd: ROOT, encoding: 'utf8', shell: true, timeout: 60000 });
const out = ((r.stdout || '') + (r.stderr || '')).trim();
if (r.status !== 0 || /AUTH_FAILED|No valid identity/i.test(out)) {
  console.error('  ❌ 尚未登录 CloudBase。请先执行 tcb login 完成授权，再重跑本脚本。');
  process.exit(1);
}
console.log('  ✅ 已登录');
if (out) console.log(out.split('\n').slice(0, 10).map(l => '    ' + l).join('\n'));

console.log('\n=== 开始云端部署 ===\n');
const d = spawnSync(process.execPath, ['云端部署.mjs'], { cwd: ROOT, stdio: 'inherit' });
process.exit(d.status ?? 1);
