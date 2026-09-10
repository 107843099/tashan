import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { LocalProvider } from '../server/local-provider.mjs';

const args = process.argv.slice(2);
const value = flag => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
let muted = false;
const output = new Writable({ write(chunk, encoding, done) { if (!muted) process.stdout.write(chunk, encoding); done(); } });
const readline = createInterface({ input:process.stdin, output, terminal:Boolean(process.stdin.isTTY) });
const provider = new LocalProvider(fileURLToPath(new URL('../.local/accounts.sqlite', import.meta.url)));
try {
  if (!provider.status().needsSetup) throw new Error('本地账号库已初始化。请登录管理员管理账号，现有数据不会被覆盖。');
  const username = value('--username') || await readline.question('管理员账号名：');
  const displayName = value('--display-name') || await readline.question('显示名称（可留空）：');
  process.stdout.write('管理员密码（输入不回显）：');
  muted = true;
  const password = await readline.question('');
  muted = false; process.stdout.write('\n');
  await provider.bootstrap({ username, password, displayName, allowDemoPassword:args.includes('--allow-demo-password') });
  console.log('本机管理员已创建。账号数据库只供本地开发，不会部署到 Cloudflare。');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { readline.close(); provider.close(); }
