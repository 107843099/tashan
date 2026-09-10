# 构建与部署

主界面由静态 HTML、CSS 和 JavaScript 提供，入口为 `index.html`。v3.4 在账号服务上增加项目版本与附件持久化：本地使用 Node + SQLite 和私有文件目录；Worker 使用 Supabase Auth / Postgres 管理账号与版本，新上传附件存入私有 R2，旧 Supabase Storage 文件按原索引继续读取。单独上传静态 ZIP 不会启用账号、执行数据库迁移或保存云端项目。

## 本地账号开发

使用 Node.js 22.13 或更新版本及 Python 3：

```sh
npm run dev:setup
npm run dev
```

首次按隐藏输入提示建立管理员，之后访问 `http://127.0.0.1:4173/`。开发服务仅绑定本机地址，账号及项目版本数据库保存在 `.local/`，项目附件保存在 `.local/project-files/`；此目录、私有环境文件和服务端源码不会作为静态资源直接提供。服务重启后保留完整 `.local/` 才能保留本地账号、版本与附件。默认使用 4173 是为了延续已有浏览器存储的来源地址；该端口只能同时运行一个服务。

`npm start` 与 `npm run dev` 启动同一个账号开发服务。完整账号配置见 [账号文档](ACCOUNTS.md)。

## 生成展示发布包

```sh
npm run build
npm test
npm run preview
```

构建生成 `dist/` 和 `releases/tashan-site.zip`。在 `http://127.0.0.1:4174/` 检查静态成果；这个预览没有账号后端。

发布包收集界面资源、14 个精选项目、配套文件、Prompt 与下载包。光学项目共享运行目录和 ZIP；生成示例使用轻量 WebP 展示图，另保留原 PNG 供大图查看与下载。`assets/js/accounts.js` 和 `assets/css/accounts.css` 随界面发布，但 `server/`、`supabase/`、`.local/`、SQLite 数据库、SQL 迁移、`.dev.vars` 和其他私有配置不进入静态目录。

构建不改写原始 `vibe coding库/`。不要直接修改 `dist/`：脚本会识别生成清单，拒绝覆盖新增文件或人工改动过的发布结果。更新源码后重新构建。

## Cloudflare Worker、Supabase 与 R2

`wrangler.jsonc` 指定 `server/worker.mjs` 为服务端入口，`./dist` 为静态资源目录，绑定名为 `ASSETS`。`/api` 与 `/api/*` 先进入账号与项目 API；项目运行目录也先经过 Worker，以添加与本地一致的 HTML 隔离策略。其他匹配资源直接作为静态文件提供。路由配置依据 [Cloudflare Worker-first 文档](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)。

正式部署前完成 [云端配置](CLOUD_SETUP.md)：按顺序执行 001–007 迁移（已有环境只执行未登记的增量）、关闭公开注册与匿名登录、建立首次管理员，并运行只读预检。005 为 `202609110005_stream_uploads.sql`，增加版本后端与已验证文件回执，不搬迁旧文件；006 增加账号归属资料，007 增加管理员 AI 提示词配置。Supabase `tashan-projects` 和 R2 `tashan-project-files` 均保持私有，文件访问统一通过项目 API。线上配置如下：

| 配置 | 存放位置 | 用途 |
| --- | --- | --- |
| `SUPABASE_URL` | Worker 环境变量或 Secret | 已配置的 Supabase 项目地址 |
| `SUPABASE_SECRET_KEY` | Workers Secret | 仅服务端调用 Auth、项目数据与 Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | 可选兼容 Secret | 旧项目的 service-role JWT，与上一项配置一种即可 |
| `SUPABASE_AUTH_EMAIL_DOMAIN` | 可选 Worker 环境变量 | 用户名的内部 Auth 映射域名 |
| `DEEPSEEK_API_KEY` | 可选 Workers Secret | 上传教学信息分析、教学建议与 Prompt 优化 |
| `TASHAN_PROJECT_FILES` | R2 binding | 私有 STANDARD 桶 `tashan-project-files`，不是普通字符串变量 |
| `TASHAN_UPLOAD_TRANSPORT` | Worker 环境变量 | 新 Worker 流程使用 `r2-stream-v1` |

AI 配置及其调用次数、文字长度、超时限制见 [AI 助手说明](AI_ASSISTANT.md)。DeepSeek 已通过真实 Worker 调用验收，见 [本轮发布记录](RELEASE_QA_2026-09-11.md)；新的部署环境仍需独立配置 Secret。

密钥不写入 `wrangler.jsonc`、`assets/` 或 `dist/`。使用 Cloudflare 面板添加 Secret，或在受控终端运行 `npx wrangler secret put SUPABASE_SECRET_KEY` 并按隐藏提示输入。配置方式参见 [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

Git 构建配置使用：

| 设置 | 值 |
| --- | --- |
| 仓库根目录 | `/` |
| Node.js | 22.13 或更新版本 |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |
| Worker 名称 | `tashan` |
| 服务端入口 | `server/worker.mjs` |
| 静态目录 | `./dist` |

Wrangler 打包 Worker 服务端代码，并从 `dist/` 上传静态文件；服务端源码不作为公开静态文件发布。不要把静态目录设为 `.`，否则会带入开发目录和安装依赖。发布检查会检查静态文件大小与内容边界。

本地验证云配置可先复制 `.dev.vars.example` 为 `.dev.vars` 并填写，再运行 `npm run cloud:check`。`npm run dev:cloud` 显式以 Supabase 模式启动 4173，仍以旧 JSON 流程将文件写入 Supabase Storage；`npm run dev:worker` 在 4176 测试 Worker。配置真实 Supabase 后，两者的账号与数据库操作都会影响该项目；本地 Worker 的模拟 R2 不等于线上桶，不要把本地模拟文件回执作为线上版本提交。普通 `npm run dev` 仍只使用本机 SQLite。切换 4173 模式前停止原服务并备份未上传资料。

Node 云模式当前没有 R2 访问凭据，读取 R2 文件会明确返回 503；需要在配置正确 R2 binding 的 Worker 站点读取或导出这类版本。不能把读不到 R2 解释为文件丢失，也不能据此删除数据库索引。私有桶不开放 `r2.dev`、桶的自定义域名或 CORS；平台域名与桶公共访问独立，浏览器只访问同源项目 API。

发布后还需在实际站点验证管理员登录、新成员直接登录与个人页主动改密、上传版本、换浏览器读取、游客访问已发布版本及撤回后的拒绝访问。预检只读取配置和迁移状态，不能替代权限及写入流程验收。项目业务上限为附件 10 MiB、封面 5 MiB，每账号 100 个项目、每项目 100 个版本；Worker 还必须配置下方上传限制，实际上限可以更低。

## Worker 的显式上传限制

Wrangler 已固定为开发依赖 `4.131.0`，依赖锁文件与源码一起维护。部署环境先执行 `npm ci`，再构建与部署；不要依赖未固定版本的全局 CLI。本机打包与 workerd 回归、实际公网验收分别记录，已完成范围见 [本轮发布记录](RELEASE_QA_2026-09-11.md)。

Worker 默认暂停新版本上传，直到操作人员明确配置请求、附件、封面与文字资料四项限制。缺失、非正整数或超出业务上限的任何一项都会维持暂停，不会自动回退到本机的大文件上限。账号登录、已有版本读取、下载、发布及撤回不因这项暂停而关闭；浏览器仍可保存项目和导出备份。

| Worker 环境变量 | 当前 `r2-stream-v1` 配置 | 含义 |
| --- | --- | --- |
| `TASHAN_UPLOAD_REQUEST_BYTES` | `98304`（96 KiB） | UTF-8 JSON 版本清单，不含附件正文 |
| `TASHAN_UPLOAD_ATTACHMENT_BYTES` | `10485760`（10 MiB） | 独立二进制请求中的单个附件 |
| `TASHAN_UPLOAD_COVER_BYTES` | `5242880`（5 MiB） | 独立二进制请求中的封面 |
| `TASHAN_UPLOAD_METADATA_BYTES` | `65536`（64 KiB） | 单版本文字快照、来源与说明 |

若旧部署的附件参数为 20 MiB，应改为不超过 `10485760`；超出当前业务限制会暂停 Worker 新上传。数据库升级需追加执行 `202609100003_attachment_limit.sql`，私有 Storage 桶通过 `npm run cloud:storage -- --update-limit` 降低文件限制，具体核验步骤见 [云端配置](CLOUD_SETUP.md)。不要重跑已安装的 001/002 迁移。

四项都需显式填写整数，不能填写 `1MB`、小数、指数表达式或 `0`。这些值是不含秘密的公开功能限制，不代表已通过生产 CPU 压测；上线前按本节流程验收。缺少 R2 binding 或选用不支持的上传协议时也不能开放新上传。旧 JSON 协议的业务上限为请求 36 MiB、文字 1 MiB，不能将该较大限制套到新的 Worker 清单配置。

该策略只由 `server/worker.mjs` 注入。普通 `npm run dev` 和基于 Node 的 `npm run dev:cloud` 不受这些 Worker 参数影响，默认仍使用36/10/5/1 MiB 上限；`npm run dev:worker` 则与 Worker 一样要求显式参数。

前端从 `/api/v1/projects/capabilities` 读取协议与限制：服务配置与 `canUpload` 分开报告，暂停时 `canUpload=false`，已配置服务仍可报告 `canPublish=true`。页面先检查 Blob、UTF-8 文字和清单大小，超限时保留浏览器资料并提示本地保存或备份。R2 模式先准备 pending 版本，再独立传附件，全部校验后完成版本；文件不放入 JSON，也不进行 Base64 展开。原始文件请求必须有整数 Content-Length，且与数据库文件描述相同，缺失返回 411、矛盾拒绝；FixedLengthStream 同时检查实际过长或截断。

SHA-256 由 R2 核对接收内容；封面仅读取前 12 字节辨别格式。条件写入不覆盖已有对象，重复请求要核对 R2 真实校验值与大小，封面还须重读实际文件头；不能以自定义元数据充当完整性证明。只有通过校验的对象回执才能完成数据库版本，失败时不发布、不删除已有文件。旧 JSON 模式继续在解码前检查大小。绕过页面不能绕过服务端限制；暂停上传返回 `UPLOADS_PAUSED`，超限返回 413。

Cloudflare Workers Free 的 10 ms 限制针对 CPU 执行时间，网络等待不计入；流式上传减少大文件解码和哈希，但鉴权、清单解析、签名检查及调度仍消耗 CPU。128 MB 内存是 isolate 共享限制，增加前端超时时间不能解决 CPU 超限。R2 开通与 Workers Paid 是独立事项，当前方案不更改套餐；R2 存储与操作也分别计费。本轮 CPU 样本见 [发布记录](RELEASE_QA_2026-09-11.md)，不能代替持续负载、内存及失败率数据，也不承诺长期容量。参见 [Cloudflare 运行限制](https://developers.cloudflare.com/workers/platform/limits/) 与 [R2 计费](https://developers.cloudflare.com/r2/pricing/)。

Supabase Free 的 1 GB Storage 额度由组织共享，包括其他项目、桶及本平台旧文件；新 R2 文件计入 R2 的存储与操作用量。本平台 200 MiB 是每账号业务限制，还计入版本文字资料，不是每个账号单独获得的供应商免费额度。上线前需分别核对 Supabase 组织和 R2 用量；账号配额不构成全站成本上限。参见 [Supabase Storage 用量](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)。

本地策略测试运行 `node tests/worker-upload-policy.mjs`；流式原语运行 `node --test tests/r2-upload.mjs`，原生流与本地 R2 模拟服务运行 `node --test tests/r2-upload-workerd.mjs`。这些检查不连接真实云，后者需能监听本机端口，也不模拟生产 Free 的 CPU 计费边界。发布前另测真实 10 MiB 附件、5 MiB 封面、错误校验值、截断、并发重复上传及旧 Supabase 文件读取。

## 静态托管与目录路径

### tashan.dev 上线顺序

目标主域名为 `tashan.dev`。先连接拥有该域名的 Cloudflare 账号，核对 Zone 已启用、现有 DNS 与 Worker 部署；保留可回退的旧部署信息。先在 Worker 测试入口配置服务端 Secrets 与经过实测的上传限制，验证账号、上传下载、发布撤回、AI 和项目隔离后，再添加 `routes: [{ "pattern": "tashan.dev", "custom_domain": true }]` 绑定主域名。绑定后仍须从 HTTPS 主域名复测同源写入、Cookie、文件下载与静态资源。

Custom Domain 由 Cloudflare 管理 DNS 与证书，若已有冲突记录先核对用途，不盲目覆盖。参考 [Custom Domains 官方说明](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。更换网站域名不会改变 `SUPABASE_AUTH_EMAIL_DOMAIN=accounts.tashan.invalid`，这只是已有账号的内部映射。

2026-09-11 已将 [tashan.dev](https://tashan.dev) 绑定到 `tashan` production，HTTPS 与域名只读检查通过；保留 workers.dev，关闭版本预览 URL。真实 R2 上传、AI、备份及正式域名后续复测范围见 [本轮发布记录](RELEASE_QA_2026-09-11.md)，未验证项继续单列。

只需要公开展示时，可上传 `dist/` 内部全部文件，或解压 ZIP 后上传内容，并把默认首页设为 `index.html`。相对资源、项目文件与 hash 路由支持静态站点子目录，保留 `auto-trailing-slash` 可使光学页面的配套资源解析正确；不存在的资源继续返回 404。相关配置见 [Cloudflare 静态资源文档](https://developers.cloudflare.com/workers/static-assets/binding/)。

账号 Worker 的 API 路径固定为站点根部 `/api/*`，线上账号版按独立站点根目录部署；若要放进已有网站的子目录，需要同步配置 API 路由与前端地址，不能只搬动 HTML。纯静态托管没有本版本的服务端 HTML 隔离响应和账号 API，应作为展示方式使用。

两个旧 HTML 文件保留查询参数和 hash 后跳转到正式入口。新链接使用 `index.html` 或目录地址；开场演示仍可使用 `index.html?intro=1`。

## 资料和环境迁移

浏览器项目、草稿、收藏与任务不会自动进入构建包，也不会因为登录而全部上传到云端。用户选择上传的版本才进入当前服务端；普通开发模式是本机，云端版本记录在 Supabase，实际文件按记录位于 Supabase Storage 或 R2。不同账号的浏览器空间彼此分开；更换协议、域名、端口或浏览器前先导出完整备份，再到目标工作台导入。旧匿名资料使用“导出旧版浏览器资料”显式导出，不在游客入口自动载入或认领。

本地 SQLite 账号、Supabase 账号和浏览器项目资料各自独立。`accounts:migrate` 提供 dry-run 与显式 apply，只新建核对过的云账号并保存新旧 ID 对照，不覆盖已有云账号，也不自动搬运项目。迁移前在原账号导出，登录对应云账号后明确导入及上传；步骤见 [云端配置与迁移](CLOUD_SETUP.md)。

原始互动项目中仍可能存在外部字体等网络依赖，发布清单记录了已知 URL。不能把整个展示库当作完整离线包；上传 HTML 的隔离预览仍遵循自己的联网限制。

## 备份与灾难恢复范围

| 备份对象 | 能恢复什么 | 不能代替什么 |
| --- | --- | --- |
| 源代码仓库与原始项目素材 | 界面、服务端代码、迁移定义、精选目录和构建脚本 | 不含 `.local/`、云账号数据或实际云端文件 |
| `dist/` / `tashan-site.zip` | 当次静态展示站点 | 不含账号、用户项目数据库、会话或私有配置 |
| 个人工作台 JSON | 导出范围内的项目、附件、封面、草稿、版本、收藏与任务 | 不含密码、账号表、会话或全站管理员资料 |
| 本人服务端项目的完整版本 JSON | 所选项目已经上传的版本历史与对应文件 | 不含其他项目、未上传草稿、收藏、任务或账号凭据 |
| 本机服务私有备份 | `.local/accounts.sqlite` 中的账号/版本记录，以及 `.local/project-files/` 中的附件 | 单独复制数据库不能恢复附件；不能恢复另一浏览器尚未上传的资料 |
| Supabase 数据库 + 旧 Supabase Storage + 新 R2 的配套备份 | 云账号、版本、存储后端与文件回执记录，以及两种存储中的实际文件 | 任一部分缺失都可能造成版本不可读，仍需单独维护环境配置 |

本机灾备先停止开发服务，再复制同一时点的数据库、仍存在的 SQLite 附属文件与完整 `project-files` 目录，存入受保护的位置。不要把这份私有备份上传到网站静态目录；恢复时也需同时恢复记录和对应附件，并用隔离环境核对账号与文件可读性。

Supabase 数据库备份不包含实际对象；应分别备份数据库、Supabase `tashan-projects` 旧文件和 R2 `tashan-project-files` 新文件，并记录对应时点、对象键、校验值及版本回执。不能只复制新桶就删除旧桶：旧版本仍引用 Supabase Storage。用户“备份此项目全部版本”通过同一个项目 API 读取两种后端，不需要手工挑桶，但仍受便携备份上限约束。平台 Auth 设置、内部用户名映射域名、Worker binding、变量和 Secrets 也需要单独安全保存与重配。相关边界见 [数据库备份说明](https://supabase.com/docs/guides/platform/backups) 和 [Storage 对象下载](https://supabase.com/docs/guides/storage/management/download-objects)。

恢复到新云环境时，先恢复数据和文件，再核对私有桶、权限、Auth 设置及首次登录，最后才连接网站。R2 重新写入同一对象键会产生新的对象版本；恢复后还需按大小与真实校验值核对对象，受控修复数据库中的对象回执映射，不能仅凭文件名相同就忽略版本不一致。个人 JSON 适合本人资料迁移，不是全站账号灾备工具。当前仓库没有自动全站恢复工具、自动云备份或定时恢复演练。
