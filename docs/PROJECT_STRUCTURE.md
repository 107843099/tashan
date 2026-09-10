# 项目结构与命名

v3.4.0-dev.1 的主站统一使用 `index.html`，浏览器作品与服务端固定版本的隔离预览使用 `project-preview.html`。旧的 `teacher-practice-demo-v3.html` 和 `local-project-preview.html` 仅做兼容跳转，保留查询参数和 hash；只修改正式入口，不再维护两份界面。

```text
software/
├── index.html                    # 正式主页面
├── project-preview.html          # 浏览器 / 服务端版本 HTML 的隔离预览
├── teacher-practice-demo-v3.html # 旧主入口兼容跳转
├── local-project-preview.html   # 旧预览入口兼容跳转
├── assets/
│   ├── js/                       # 平台行为与组件
│   ├── css/                      # 平台样式
│   ├── data/                     # 自动生成的浏览器数据
│   ├── covers/                   # 项目缩略图与示例图
│   ├── icons/                    # 本地图标与许可
│   └── vendor/                   # 随平台提供的第三方运行资源
├── data/                         # 人工维护的目录、译文和教学数据
│   └── generated/                # 生成的目录 JSON 与提取 Prompt
├── vibe coding库/                # 本地教学资料原件
├── server/                       # 账号、项目版本、发布 API 与存储适配
├── supabase/
│   ├── config.toml               # Supabase CLI 本地设置
│   └── migrations/               # 账号与项目两份数据库迁移
├── .local/                       # 私有本机数据，不进入 Git / 静态发布包
│   ├── accounts.sqlite           # 账号、会话、项目版本与附件索引
│   ├── project-files/            # 本机服务的实际附件，按账号 / 内容哈希保存
│   └── account-migration-*.json  # 显式迁移的私有计划和结果
├── scripts/                      # 构建、服务、账号引导、云预检与迁移工具
├── tests/                        # 当前平台的功能与存储检查
├── docs/                         # 当前维护文档
├── archive/                      # 旧原型、旧文档与改动前备份
├── dist/                         # 构建生成的静态站点文件
├── releases/tashan-site.zip      # 静态展示上传包，不含用户数据 / 账号服务
├── wrangler.jsonc                # Worker 入口与静态资源绑定，无 Secret
├── .dev.vars.example             # 空白私有配置模板，实际 .dev.vars 不追踪
└── package.json                  # 名称 tashan 与统一运行命令
```

## 运行文件

| 文件 | 职责 |
| --- | --- |
| `assets/js/app.js` | 页面渲染、hash 路由、筛选、收藏、创作与工作台 |
| `assets/js/storage.js` | 按账号区分的 IndexedDB 项目、版本、附件、草稿、收藏、任务与 v2 备份 |
| `assets/js/project-lifecycle.js`、`assets/css/project-lifecycle.css` | 稳定编号、版本与来源、服务端上传 / 恢复、发布 / 撤回、完整历史备份 |
| `assets/js/accounts.js`、`assets/css/accounts.css` | 登录、改密与管理员界面 |
| `server/api.mjs` | Cookie 会话、权限校验与账号接口 |
| `server/local-provider.mjs`、`server/supabase-provider.mjs` | 本地 SQLite 与线上 Supabase 适配 |
| `server/projects-api.mjs` | 项目请求校验、版本与文件接口、发布边界 |
| `server/local-projects.mjs`、`server/supabase-projects.mjs` | 本机 SQLite / 私有文件和云数据库 / Storage 的项目适配 |
| `server/runtime-policy.mjs` | 原始项目 HTML 的服务端隔离响应 |
| `server/worker.mjs` | Cloudflare 账号与项目 API 入口 |
| `assets/js/project-preview.js` | 浏览器及服务端固定版本的 HTML 隔离运行、会话复核与源文件下载 |
| `assets/js/icons.js` | 平台图标 |
| `assets/js/project-showcase.js` | 首页精选作品轮播 |
| `assets/js/entry-ceremony.js` | 开场流程与交互 |
| `assets/js/entry-stone-scene.js` | 石头与玉芯的三维场景 |
| `assets/css/app.css` | 主站界面与响应式样式 |
| `assets/css/project-preview.css` | 作品预览界面样式 |
| `assets/css/entry-ceremony.css`、`assets/css/project-showcase.css` | 开场与轮播组件样式 |
| `assets/data/catalog.js`、`assets/data/translations.js` | 供浏览器读取的生成数据 |

文件名使用小写英文与连字符；功能模块按职责命名，不将版本号、日期或“demo”写进正式入口名称。中文标题和原资料文件名属于教学内容，保留原样，运行路径由构建程序处理。

本地新项目使用 `local-…` ID 与稳定的 `TS-L-…` 项目编号，历史快照使用 `version-…` ID；改标题或移动源文件不作为更换身份的理由。收藏、任务和来源引用保留项目关系，备份另存副本时才明确映射导入的 ID 和编号。数据库中的 `owner_id` 决定服务端私有项目归属，不能仅靠用户名或前端路径判断。

## 内容的单一来源

`data/catalog-curation.json` 登记精选展示项目与源资料路径，`data/interface-translations.json` 集中管理主界面译文。原先独立的流程译文已合并到同一个词典；账号及项目生命周期模块的三语文案分别封装在 `assets/js/accounts.js`、`assets/js/project-lifecycle.js`。教学建议、验证记录与生成图记录仍分别存放在 `data/teaching-analysis.json`、`data/verification.json`、`data/generated-examples.json`。

执行 `npm run catalog`，读取资料并生成 `data/generated/catalog.json`、`data/generated/prompts/`、`assets/data/catalog.js` 和 `assets/data/translations.js`，同时刷新入口中的资源版本标记。请修改输入文件，不要直接编辑生成文件。

`vibe coding库/` 保留原资料和用户要求另存于原目录的示例 PNG。相同内容的资料不会因此重复展示；发布构建只收集需要的内容，并合并可安全复用的相同文件。项目 HTML 的配套相对资源结构与原下载包保持完整。

用户的项目与版本不写进精选目录或 `assets/data/`。浏览器工作台写 IndexedDB；明确上传的版本才进入当前服务端。普通 `npm run dev` 使用 `.local/`，`npm run dev:cloud` 显式选择 Supabase；云端使用 `tashan_accounts`、`tashan_projects`、`tashan_project_versions`、`tashan_project_assets` 和私有 `tashan-projects` 桶。实际云环境仍需配置与迁移，见 [云端配置](CLOUD_SETUP.md)。

## 开发与运维工具

| 文件 | 职责 |
| --- | --- |
| `scripts/dev-server.mjs` | 回环地址开发服务，显式区分本机 / 云端提供方，限制静态文件范围 |
| `scripts/bootstrap-local-admin.mjs`、`scripts/bootstrap-admin.mjs` | 本机与云端首次管理员引导，私密输入密码 |
| `scripts/cloud-check.mjs` | 只读检查云配置、账号 / 项目迁移、管理员与私有桶 |
| `scripts/migrate-local-accounts.mjs` | 默认生成私有迁移计划，显式 apply 新建云账号，不覆盖已有身份 |
| `scripts/build-catalog.py`、`scripts/update-asset-versions.py` | 生成精选目录、提取文档并刷新入口资源标记 |
| `scripts/build-release.py` | 构建静态发布目录与 ZIP，汇总路径和内容哈希 |

`tests/library-storage.mjs` 与 `tests/project-model.mjs` 检查浏览器存储、稳定编号、版本及原子备份导入；账号和项目 API 测试检查服务端权限与持久化规则。`tests/account-browser.mjs`、`tests/project-browser.mjs` 用于真实浏览器流程，`tests/release-package.mjs` 检查发布边界。测试结果与真实云验证分别记录，不能用模拟提供方通过代替云环境已经上线。

## 历史文件与发布产物

`archive/` 保存旧原型和历史备份，不进入发布包。详细移动记录见 [归档说明](../archive/README.md)。

`dist/` 与 `releases/tashan-site.zip` 是生成产物。每次修改源码后重新构建，不直接修改发布目录；构建脚本依据清单识别自己的旧产物，发现人工修改或额外文件时会拒绝覆盖。静态包不含 `server/`、SQL、`.local/`、迁移凭据或 `.dev.vars`。Worker 的服务端代码由部署工具单独打包，发布方式见 [部署说明](DEPLOYMENT.md)。

## 浏览器数据兼容

入口与目录整理保留项目 ID 和既有 IndexedDB 名称。v3.4 将账号收藏和任务首次迁入 IndexedDB，保留原 localStorage 键；旧匿名资料仅在登录后显式附带 `workspace` 导出，再由本人导入目标账号。

完整浏览器备份格式为 v2，包含项目、文件、草稿、版本、收藏和任务，仍能读取旧 v1 备份。导入先检查重复与冲突，再在一个事务内提交；跳过冲突或另存副本均不覆盖当前不同内容。便携资料上限为去重后 50 MiB，服务端账号为 200 MiB，二者独立；仅存在服务端的项目历史需另外选择“备份此项目全部版本”。详情见 [本地资料与备份](LOCAL_STORAGE.md)。

个人 JSON 不含密码、账号表或会话。源码、个人资料、本机数据库与附件、云数据库与 Storage 分别备份，灾备范围见 [部署说明](DEPLOYMENT.md#备份与灾难恢复范围)。
