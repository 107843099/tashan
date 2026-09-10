# 他山 · Tashan

教学项目展示与创作平台，主入口为 `index.html`，上传作品预览为 `project-preview.html`。保留浅色默认、简繁英文、凿石成玉开场和精选项目轮播。

当前为 **v3.4.0-dev.1 项目保存与发布开发版**。保留原石场景登录、游客浏览和管理员发放账号，新增固定项目编号、不可变版本、来源引用及完整工作台备份。已上传版本可明确发布与撤回；本机使用 SQLite 与私有文件目录，云端账号与版本使用 Supabase Auth / Postgres，新 Worker 上传文件使用私有 R2，旧 Supabase Storage 文件保留可读。本机已完成 Supabase 配置，真实验证范围见 [验证记录](docs/PROJECT_VERSION_QA.md)；克隆仓库不会获得私有配置。

## 运行账号开发版

需要 **Node.js 22.13 或更新版本**与 Python 3。本地账号使用 Node 内置 SQLite，无需安装数据库或填写云服务密钥。

```sh
npm run dev:setup
npm run dev
```

首次运行 `dev:setup`，按终端提示建立管理员，密码通过隐藏输入设置，没有默认密码。之后打开 [本地平台](http://127.0.0.1:4173/)，由管理员登录并创建成员账号。新账号使用分配的密码直接登录，需要时可在「我的账户」主动修改密码。账号数据库及本地私有配置保存在 `.local/`，开发服务不提供这些文件的下载。

开发服务默认只监听 `127.0.0.1:4173`。切换前停止占用同一端口的旧静态服务；保留这个地址可沿用原浏览器存储。修改源资料后运行 `npm run catalog` 并刷新。详见 [账号使用与配置](docs/ACCOUNTS.md)。

## 静态展示与发布

```sh
npm run build
npm test
npm run preview
```

构建生成 `dist/` 和 `releases/tashan-site.zip`。在 [发布预览](http://127.0.0.1:4174/) 检查展示、原作品与下载。ZIP 根目录直接包含 `index.html`，不包含账号服务器、密钥、SQLite 数据库或历史归档。

`npm start` 与 `npm run dev` 均启动账号开发服务；`npm run preview` 仅预览发布目录，不提供账号 API。部署线上账号版需要 Cloudflare Worker 和已配置的 Supabase，上传静态 ZIP 本身不会开通账号服务。配置步骤见 [部署说明](docs/DEPLOYMENT.md)。

## 当前内容与资料范围

- 14 个精选本地项目：9 个可视化作品、5 个 Prompt / 教案模板。
- 5 张生成示例、三语教学建议、来源与验证记录、原文及下载。
- 访客可筛选、查看详情和体验公开作品；收藏、保存创作、工作台与上传需要登录。
- 稳定项目编号、版本记录、带版本的来源引用、去重备份与冲突导入。
- 版本上传、发布与撤回；游客预览固定公开版本，成员继续创作保留来源。
- 项目附件最大 10 MiB；上传文字自动分析八项必填资料，支持 DeepSeek 教学建议和 Prompt 优化。
- 管理员创建、修改、停用及重置账号；表单就近反馈，可生成初始密码。创建成功后清除列表筛选并选中新账号。

浏览器里的草稿、收藏、任务和项目历史按账号保存；上传到服务端的版本可在其他设备登录读取。工作台会明确显示当前为“本机服务存储”或“云端项目”。登录不会自动上传全部浏览器资料，发布也不会随保存草稿自动发生。

完整 JSON 备份包含当前工作台的项目、文件、草稿、收藏、任务和历史版本；本人服务端项目另有“备份此项目全部版本”。备份上限为附件去重后 50 MB，云端独有资料需要单独备份。旧访客资料可从工作台显式导出，不自动归给首个登录的人。账户数据库、密码和登录会话不进入个人项目备份；完整系统灾备范围见 [云端配置与备份](docs/CLOUD_SETUP.md)。

准备云端时运行 `npm run cloud:check`，按 [云配置步骤](docs/CLOUD_SETUP.md) 配好 Supabase 后使用 `npm run dev:cloud`。本地账号迁移先运行 `npm run accounts:migrate -- --dry-run` 生成计划，核对后才执行创建；不会覆盖云端已有账号。更换域名、端口或浏览器前先导出工作台资料，不要删除 `.local/` 或清理站点数据作为升级步骤。

## 维护文档

- [AI 助手、自动分析与真实验证](docs/AI_ASSISTANT.md)
- [2026-09-11 上线与示例验收](docs/RELEASE_QA_2026-09-11.md)
- [账户页面、8 位密码与上线复测](docs/ACCOUNT_SETTINGS_QA.md)
- [账号使用与配置](docs/ACCOUNTS.md)
- [v3.4 验证记录](docs/PROJECT_VERSION_QA.md)
- [云端配置与迁移](docs/CLOUD_SETUP.md)
- [本轮边界与下一版本](docs/NEXT_VERSION.md)
- [构建与部署](docs/DEPLOYMENT.md)
- [项目结构与命名](docs/PROJECT_STRUCTURE.md)
- [本地内容与目录维护](docs/LOCAL_LIBRARY.md)
- [本地存储与备份](docs/LOCAL_STORAGE.md)
- [示例图与生成记录](docs/PROMPT_IMAGE_EXAMPLES.md)
- [教学建议与参考资料](docs/TEACHING_REFERENCES.md)
- [开场动效](docs/TASHAN_ENTRANCE.md)
- [历史原型与文档](archive/README.md)

平台已通过 Cloudflare 上线到 [tashan.dev](https://tashan.dev)，正式域名的 HTTPS 与只读检查已通过；R2 上传、两个公开示例、真实 DeepSeek 调用及备份范围见 [本轮发布验收](docs/RELEASE_QA_2026-09-11.md)。Worker 的新版本上传限制已显式配置，不能直接沿用 Node 本机上限；生产样本不代表长期容量保证。浏览器视觉与全流程操作验收仍单独记录，教学建议、生成示例和运行检查不代表真实课堂成效。
