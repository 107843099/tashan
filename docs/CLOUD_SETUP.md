# 云端配置与账号迁移

v3.4 使用 Supabase Auth 与 Postgres 保存账号、项目版本、权限和附件索引，Cloudflare Worker 提供同站点 API。新的 Worker 上传流程把原始附件流存入私有 R2；已有 Supabase Storage 文件按原索引继续读取，不搬迁或删除。真实验收范围见 [验证记录](PROJECT_VERSION_QA.md)；本轮 R2 流程、生产 CPU 数据和正式域名须分别验收，本文不预先记录为完成。其他开发环境需要独立配置，单独部署静态页面不会自动获得云服务。

## 1. 准备 Supabase

在自己的 Supabase 项目执行以下迁移，按文件名顺序执行；已执行的迁移不要重复粘贴运行。其中 001/002 是首次安装迁移，不是可反复执行的幂等脚本。先检查同名表、函数、序列和迁移历史；已有完整安装只核验结构与权限，部分安装或同名冲突先比对并写增量修复，不通过删除旧对象解决。

1. `supabase/migrations/202609100001_accounts.sql`：账号目录、权限、会话与审计。
2. `supabase/migrations/202609100002_projects.sql`：项目、不可变版本与附件索引；存储桶在数据库迁移之外单独创建。
3. `supabase/migrations/202609100003_attachment_limit.sql`：把新附件上限降为 10 MiB；仅替换对应函数体并保留服务端授权，封面 5 MiB、账号 200 MiB 和已有项目资料保持原状。已有环境只执行尚未登记的增量迁移。
4. `supabase/migrations/202609100004_account_onboarding.sql`：新账号默认直接登录；只解除有明确创建审计、未改密且没有凭据锁的启用账号的初始改密标记。管理员重置、来源不明或存在中断凭据操作的账号保留原状态。
5. `supabase/migrations/202609110005_stream_uploads.sql`：增加版本存储后端和经过服务端校验的文件回执；R2 文件全部核对成功后才完成版本。旧版本保留 Supabase 后端，001–004 不改写。

将本轮待安装的 SQL 放在同一事务中执行，任意语句失败就回滚，避免表或函数已创建但权限尚未收紧的中间状态。迁移仅授权各自声明的精确函数签名，不修改同名前缀的其他函数或重载；审计序列也显式撤销 `PUBLIC`、`anon`、`authenticated` 的默认权限。已有 CLI 迁移流程时，先查看 `supabase migration list` 和 `supabase db push --dry-run`，不要混用未登记的手动迁移。参见 [迁移与历史同步](https://supabase.com/docs/guides/deployment/database-migrations)。

数据库迁移成功后，通过 Supabase Storage 面板或服务端 Storage API 单独建立 `tashan-projects` 桶，设置 `public=false`、单文件上限 `10485760` 字节（10 MiB）。完成第 2 节的私有配置后，使用仓库的配置命令：

```sh
npm run cloud:storage
npm run cloud:storage -- --apply
```

第一个命令默认只读；只有确认缺桶后才运行带 `--apply` 的命令，通过 Storage API 创建并回读核验。已有桶配置一致时不修改；可见性、10 MiB 限额、MIME 限制或桶类型不一致时停止，不更新、不清空、不删除。若创建中断，先重新执行只读检查，再核对结果，不直接重复创建。这些命令读取私有配置，不打印密钥，也不应在网页中运行。迁移不直接写入 `storage.buckets` 或 `storage.objects`，对象操作也通过 Storage API 完成。参见 [创建桶 API](https://supabase.com/docs/reference/javascript/file-buckets-createbucket) 与 [Storage 元数据说明](https://supabase.com/docs/guides/storage/schema/design)。

已存在旧 20 MiB 桶时，默认检查会报告与当前限制不一致，`--apply` 仍不会修改它。核对目标后，操作人员单独执行：

```sh
npm run cloud:storage -- --update-limit
npm run cloud:storage
npm run cloud:check
```

`--update-limit` 与 `--apply` 互斥，只接受已有同名、私有、STANDARD 类型、无 MIME 限制且原上限不低于 10 MiB 的桶。工具通过 Storage API 的 PUT 仅提交 `file_size_limit: 10485760`，随后 GET 回读核验；不变更公开状态、类型、MIME 限制，也不删除或改写已有文件。原限制已经为 10 MiB 时不发写请求，更严格的小上限不会被调高；缺桶、配置冲突或结果不确定时停止。写请求中断后先核对控制台并重新只读检查，不直接重试。此方式依据 [Storage 更新接口](https://raw.githubusercontent.com/supabase/storage/master/src/http/routes/bucket/updateBucket.ts) 支持单独更新文件上限。

部分 Hosted Storage API 的 GET 响应不含 `type`，工具会保守停止，不把缺失字段当成 STANDARD。此时先在面板或通过只读数据库查询确认该桶确为 STANDARD，再由操作人员在面板或受控服务端请求中仅修改文件上限，并回读核验；不要为通过检查而改桶类型。

上限采用 `1 MB = 1024 × 1024` 字节：新项目附件不超过 10 MB，封面不超过 5 MB，便携备份去重后的总量仍为 50 MB，每账号服务端总量仍为 200 MB。Node 的旧 JSON 流程保留 36 MiB 传输边界，容纳 Base64 展开；新的 Worker 流程只允许 96 KiB 清单和 64 KiB 版本文字资料，文件通过独立原始二进制请求上传。已存的大附件不因升级删除；重新导入或提交为新附件时须符合 10 MiB 限制。

账号与项目表只供服务端角色访问。附件桶保持 `public=false`，不要给 `anon` 或 `authenticated` 新增通用对象读写策略；还需检查 `storage.objects` 和 `storage.buckets` 中已有的策略，确保其他业务的宽泛策略不会覆盖这个桶。私有文件和已公开版本都通过平台 API 判断访问范围，不把桶改成公开以解决下载问题。Supabase 的公开桶会绕过读取权限检查，见 [存储桶说明](https://supabase.com/docs/guides/storage/buckets/fundamentals)。

在 Authentication 设置中关闭 **Allow new users to sign up** 与匿名登录；保留 Email/Password 提供方，供平台将用户名映射为内部邮箱。用户仍只输入用户名和密码，不通过邮箱公开注册。仓库的 `supabase/config.toml` 不会替你修改已有 Hosted 项目的面板设置。参见 [Auth 配置](https://supabase.com/docs/guides/auth/general-configuration)。

## 2. 填写私有配置

需要 Node.js 22.13 或更新版本。把 `.dev.vars.example` 复制为本机 `.dev.vars` 后，在编辑器里填写：

| 变量 | 内容 |
| --- | --- |
| `SUPABASE_URL` | Supabase 项目的 HTTPS 根地址 |
| `SUPABASE_SECRET_KEY` | 服务端 Secret key，通常以 `sb_secret_` 开头 |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅用于兼容旧项目的 service-role JWT；与上一项配置一种即可 |
| `SUPABASE_AUTH_EMAIL_DOMAIN` | 可选，默认 `accounts.tashan.invalid`；建立账号后保持一致 |

不要填写 publishable/anon key 代替服务端密钥，也不要把服务端密钥写进 HTML、浏览器存储或 `wrangler.jsonc`。Secret key 是服务器凭据，现代 Secret key 也不能当作用户 JWT；适配代码据此区分请求头。参见 [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)。

云端工具自动读取存在的 `.dev.vars`，同名终端环境变量优先。只从中读取 Supabase 相关配置，不输出密钥。`.dev.vars` 与 `.local/` 已被 Git 忽略，也不进入静态发布包；不要手动打包整个开发目录上传。

## 3. 建立首次云管理员并预检

在云账号目录为空时运行：

```sh
npm run accounts:bootstrap -- --username your-admin --display-name "管理员"
npm run cloud:check
```

引导命令在终端隐藏输入密码，不使用默认密码或明文命令参数。它不能覆盖已有管理员；以后通过管理员界面创建账号。新设密码至少 8 位，允许纯数字，不要求混合字母；UTF-8 编码不超过 72 字节。该规则适用于管理员初始化、创建账号、重置密码和本人修改密码，已有密码继续按原值验证。

`cloud:check` 只发读取请求，检查以下条件：

- 云地址和服务端凭据格式有效；实际请求能连接服务。
- 公开注册、匿名登录关闭，密码提供方开启。
- 账号表、项目三张表和必要 RPC 已注册。
- 存在可用且不处于重置后待改密状态的管理员。
- `tashan-projects` 存储桶存在、为私有，且单文件上限精确为 10 MiB。

可运行 `npm run cloud:check -- --json` 获得不含凭据的 JSON 结果。退出码 `0` 表示这些检查通过，`2` 表示配置未就绪，`1` 表示其他检查未通过。如果 OpenAPI 未显示必要 RPC，先核对完整迁移和 PostgREST schema cache；本工具不会为预检调用创建账号、上传或发布等写接口。

预检只确认 RPC 已注册，不读取函数体，因此不能单凭预检通过证明 003 的 10 MiB 校验已安装；还须核对迁移历史。预检不替代 RLS 权限复核、实际上传/下载与不同账号的隔离验收，也不检查 Cloudflare 已经发布成功。没有配置时工具直接报告未就绪，不尝试连接网络或创建资源。

## 4. 从本机验证云模式

```sh
npm run dev:cloud
```

该命令显式选择 `TASHAN_ACCOUNT_PROVIDER=supabase`，加载本机私有配置，在 4173 端口运行界面与 API。必须先停止占用 4173 的本地 SQLite 服务。普通 `npm run dev` 仍选择 SQLite；仅填写 Supabase 环境变量不会把普通开发启动悄悄切到云端。

两种模式的账号 ID 和项目资料彼此独立。相同用户名不代表同一个身份，切换模式后需要重新登录。云模式中的创建、停用、上传和发布操作会修改配置的真实 Supabase 项目，不是本地模拟。

`npm run dev:cloud` 是 Node 模式，仍通过旧 JSON 流程上传到 Supabase Storage。它没有 R2 binding 或 R2 访问凭据，读取已存入 R2 的文件会明确返回 503，不能把这种情况当作文件丢失。需要读取或备份 R2 版本时，使用已配置 binding 的 Worker 站点；本地 Worker 的模拟 R2 与线上桶也不是同一份资料。

先用一个管理员和一个成员验收：新账号直接登录 → 个人页主动改密 → 保存版本 → 上传 → 换浏览器读取自己的版本 → 发布指定版本 → 游客读取 → 撤回后公开链接不可用。另一账号不能读取私有版本或替作者发布；被停用账号的受保护接口应拒绝访问。没有经过这些实际验证前，不把“预检通过”写成“线上功能全部完成”。

## 5. 迁移本地账号

本机 SQLite 使用自定义 scrypt 密码哈希，不能直接作为当前 Supabase Auth 的密码导入。官方迁移接口说明支持 bcrypt/Argon2 密码哈希；此工具选择新建账号并分配新初始密码，不尝试破解、复制或降低本地密码保护。参见 [官方账号迁移说明](https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0)。

先执行只读规划：

```sh
npm run accounts:migrate -- --dry-run
```

默认不带参数也只生成计划。工具仅从本项目 `.local/accounts.sqlite` 读取 ID、用户名、显示名、角色、状态和更新时间，不读取密码哈希或会话，不修改 SQLite。计划保存为 `.local/account-migration-<id>.json`，权限为 `0600`；没有云配置也能形成离线清单，但该清单不能执行 apply，配置完成后需重新生成。

计划中 `create` 表示新账号，`conflict` 表示云端已有同名账号，`skip` 表示跳过的停用账号。请先核对：保留所有已有云账号，对不迁移的条目只把 `action` 改为 `skip`。不要修改用户名、角色或 ID；需要调整时先在本机管理界面修改，再重新生成计划。冲突不会自动合并，也不会停用或覆盖现有管理员。

完成核对后，显式指定计划文件与一个可正常使用的云管理员：

```sh
npm run accounts:migrate -- --apply .local/account-migration-<id>.json --admin your-admin
```

执行前会重新检查目标环境、当前本地资料、管理员和同名冲突。只创建计划中仍可新增的启用账号，角色沿用本地记录，每个账号生成独立随机初始密码，可直接登录并在个人页按需修改。已有云账号与本地数据库均不改动。

新旧 ID、进度和初始密码仅保存在另一个 `.local/account-migration-result-<id>.json`，不会打印密码。工具在发出新增请求前先保存该账号凭据；如果请求中断、创建结果不确定或中途失败，会停止，不自动重试、删除或重置账号。先查看结果文件，再通过云管理员界面核对是否已创建；保留已创建项，重新生成计划并明确跳过这些用户名后才能继续。本人更新密码后可从结果文件移除初始密码，保留 ID 对照供后续资料核对。

账号迁移不移动浏览器项目、收藏、任务、草稿或本机服务器上的项目文件，也不自动将旧账号空间归给同名云账号。切换前在原账号工作台导出完整备份；登录对应云账号后显式导入、核对，再选择需要上传的版本。旧匿名资料继续使用“导出旧版浏览器资料”入口，不能通过账号映射自动认领。

仅保存在原服务端的本人项目，应另行导出该项目完整版本历史。个人 JSON 和项目历史 JSON 都不含账号表、密码或会话，不能代替账号数据库备份；全站恢复还需对应的数据库、Storage 对象与环境配置，见 [备份与灾难恢复范围](DEPLOYMENT.md#备份与灾难恢复范围)。

工具不开放迁移 HTTP 路由，也不代替本人确认项目归属。小批量账号仍可在云管理员界面手动重建，使用同样的备份导入流程。

## 6. 发布与后续边界

在 Cloudflare Worker 为同一个 Supabase 项目配置上述变量；Secret 使用面板或 `wrangler secret put`，不要复制本机 `.dev.vars` 为公开文件。新增私有 STANDARD R2 桶 `tashan-project-files`，以 `TASHAN_PROJECT_FILES` 绑定 Worker，并配置 `TASHAN_UPLOAD_TRANSPORT=r2-stream-v1` 及 [部署文档](DEPLOYMENT.md) 中四项限制。先核对已有资源，不覆盖同名桶；新增桶后检查绑定指向与私有状态。

R2 不开放 `r2.dev` 公共访问、不绑定桶的自定义域名，也不添加 CORS。浏览器始终请求平台同源 API，由 Worker 检查账号、项目所有权或发布状态后读取文件；网站 `tashan.dev` 的 Worker 域名绑定与桶的公共访问是两回事。参见 [R2 私有与公共桶](https://developers.cloudflare.com/r2/buckets/public-buckets/)。单独上传 `tashan-site.zip` 只提供静态展示，不会创建账号数据库、执行迁移或启用项目 API。

本轮支持的是明确保存的项目版本与附件。浏览器中的收藏、创作任务和未上传草稿仍依赖备份；ZIP 附件可以保存和下载，尚不自动解包运行。DeepSeek 教学建议、Prompt 优化及上传分析已接通并设置调用限额，说明见 [AI 助手](AI_ASSISTANT.md)；后续范围见 [下一版本](NEXT_VERSION.md)。

## 7. 大附件与 Workers 运行限制

Worker 新流程先提交小型版本清单，数据库保留 pending 版本与配额；再逐个上传原始附件，最后完成版本。二进制请求必须提供与已验证描述一致的 Content-Length；缺少长度拒绝，实际流经 FixedLengthStream 再检查过长或截断。封面只读取前 12 字节确认格式，其余原样转发；SHA-256 交给 R2 验证，Worker 不对完整附件进行 Base64 解码或整包哈希。R2 条件写入避免覆盖已有对象；重复请求核对真实大小、校验值及封面签名后才能复用。参见 [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) 和 [固定长度流](https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#fixedlengthstream)。

Cloudflare Workers 每个实例的内存上限为 128 MiB，Free 套餐每个 HTTP 请求的 CPU 限额为 10 ms。开通 R2 不代表升级 Workers Paid，两者分别计费；R2 STANDARD 按存储量和操作计费，有月度免费额度，超出会产生费用。当前方案不更改 Workers 套餐。参见 [Workers 官方限制](https://developers.cloudflare.com/workers/platform/limits/) 与 [R2 计费](https://developers.cloudflare.com/r2/pricing/)。

流式处理减少与文件大小相关的 JavaScript 工作，但鉴权、清单解析、签名检查和请求调度仍消耗 CPU，不能据此保证 Free 的 10 ms 限额稳定通过。上线前在目标套餐实际测量 10 MiB 附件、5 MiB 封面、中文资料、并发及重试的 CPU、内存与失败率；本机 workerd 或 Node 测试不替代这一步。上传中断时重试同一版本，未完成的快照保持私有且不能发布；不要通过修改版本 ID 绕过重试。
