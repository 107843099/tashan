#!/usr/bin/env node
// Run locally with server credentials in the environment. This is not an HTTP route.
import { createSupabaseProvider } from '../server/supabase-provider.mjs';
import { validateUsername, validateDisplayName, validatePassword } from '../server/api.mjs';

function argumentsFrom(values) {
  const args = {};
  for (let i = 0; i < values.length; i += 2) {
    if (!['--username', '--display-name'].includes(values[i]) || !values[i + 1] || values[i + 1].startsWith('--')) throw new Error('用法：node scripts/bootstrap-admin.mjs --username 用户名 --display-name 显示名称');
    args[values[i].slice(2)] = values[i + 1];
  }
  return args;
}
async function privatePassword(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('请在交互式终端运行；密码不会从命令行参数或环境变量读取。');
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error, result) => {
      process.stdin.removeListener('data', receive);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(result);
    };
    const receive = chunk => {
      for (const character of chunk) {
        if (character === '\u0003') return done(new Error('已取消。'));
        if (character === '\r' || character === '\n') return done(null, value);
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ' && value.length < 73) value += character;
      }
    };
    process.stdin.on('data', receive);
  });
}
try {
  const args = argumentsFrom(process.argv.slice(2));
  const username = validateUsername(args.username || '');
  const displayName = validateDisplayName(args['display-name'] || '');
  const provider = createSupabaseProvider(process.env);
  if (!(await provider.status()).configured) throw new Error('请先设置 SUPABASE_URL 与 SUPABASE_SECRET_KEY（或兼容的 SUPABASE_SERVICE_ROLE_KEY），并应用数据库迁移。');
  const password = validatePassword(await privatePassword('设置初始管理员密码（至少 8 位，可纯数字，输入不显示）：'));
  if (password !== await privatePassword('再次输入密码：')) throw new Error('两次密码不一致，未创建账号。');
  const user = await provider.bootstrapAdmin({ username, displayName, password });
  process.stdout.write(`初始管理员 ${user.username} 已创建。请在平台登录；后续账号通过管理员工作台创建。\n`);
} catch (error) {
  // Safe application errors only; never log request bodies, provider replies or credentials.
  process.stderr.write((error?.message || '初始管理员创建失败。') + '\n');
  process.exitCode = 1;
}
