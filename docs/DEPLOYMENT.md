# 构建与静态部署

平台是静态 HTML、CSS 和 JavaScript，可上传到支持静态文件的托管目录。正式入口为 `index.html`，不需要数据库、服务器程序或环境密钥。

## 生成上传包

在包含 `package.json` 的项目根目录运行：

```sh
npm run build
npm test
```

`npm run build` 重新生成目录数据和资源版本标记，执行静态与发布检查，并生成：

- `dist/`：完整的网站发布目录。
- `releases/tashan-site.zip`：同一份网站的 ZIP 包，解压后根目录直接包含 `index.html`。

发布构建收集平台资源、展示项目、配套资源、Prompt 与下载包，并对可以复用的相同文件去重。历史归档、测试、开发文档、系统隐藏文件和 `node_modules` 不需要上传。原始 `vibe coding库/` 继续保留，构建不改写原件。

## 本地检查发布版本

```sh
npm run preview
```

访问 [发布预览](http://127.0.0.1:4174/)，检查首页、筛选、项目详情、原作品运行、文件下载，以及手机宽度下的显示。`npm start` 在 4173 端口运行开发目录，`npm run preview` 在 4174 端口运行构建产物；两个端口使用不同的浏览器资料库。

主站资源随包提供；部分原始互动项目依赖外部 CDN，需要联网运行。构建产生的发布清单记录这些外部依赖，不能将整个项目库视为完整离线包。上传项目的隔离预览仍禁止外部联网，这是预览器自身的行为。

## Cloudflare Workers 部署

仓库根目录的 `wrangler.jsonc` 已指定 Worker 名称 `tashan` 与静态资源目录 `./dist`。在 Cloudflare 的 Git 构建设置中使用：

| 设置 | 值 |
| --- | --- |
| 仓库根目录 | `/`（仓库根目录） |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |
| Worker 名称 | `tashan` |
| 静态资源目录 | `./dist`，由 `wrangler.jsonc` 指定 |

构建成功后 Wrangler 只上传 `dist/` 内的网站文件。不能把静态资源目录设成 `.`：仓库根目录会包含安装的 `node_modules`，其中的 `workerd` 可执行程序会超过 Cloudflare 静态资源单文件 25 MiB 的限制。发布检查会验证目录和文件大小，防止这个问题再次出现。

保留 `auto-trailing-slash` 处理目录首页，使光学实验等页面的相对资源路径正常；主平台的 hash 路由不需要 SPA 全站回退。不存在的资源仍返回 404。

推送配置后部署最新提交；如需手动重试，请选择包含 `wrangler.jsonc` 的最新版本。Cloudflare 官方说明：[静态资源配置](https://developers.cloudflare.com/workers/static-assets/binding/)、[HTML 路径处理](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)。

## 其他静态托管目录上传

1. 选择静态托管的目标目录。
2. 上传 `dist/` **内部的全部文件与子目录**，或先解压 `releases/tashan-site.zip` 后上传其内容。
3. 让目标目录的默认文档指向 `index.html`。
4. 用目标网址检查入口、图片、项目原页和下载链接。

入口、脚本、样式与资料使用相对路径，支持部署到网站根目录或子目录。项目详情使用 `#project/...` 等 hash 路由，不需要额外配置服务器端页面重写。保留文件的相对目录结构，不要只上传 HTML，也不要将所有文件压平到同一个文件夹。

两个旧 HTML 文件只是兼容入口，保留查询参数和 hash 后跳转到正式页面。新分享链接使用 `index.html` 或目录地址；开场演示可使用 `index.html?intro=1`。

## 浏览器中的资料迁移

浏览器上传的项目、附件与草稿保存在 IndexedDB 中，不会自动写入 `dist/` 或 ZIP，也不会因为上传网站而公开。发布包中的项目来自源码目录登记的本地资料。

迁移到新协议、域名、端口或浏览器前，在旧站点工作台导出 JSON 备份，再到新站点导入。当前备份包含上传项目与草稿，收藏和创作任务需要另外记录或复制。相同来源下仅修改 HTML 文件名不影响原资料；详细行为见 [本地存储与备份](LOCAL_STORAGE.md)。

如需把浏览器中的作品纳入所有访客都能看到的公共展示，先将原文件及封面保存到本地资料目录，并在 `data/catalog-curation.json` 中登记，再重新构建上传。

## 后续更新

修改源码或 `data/` 后重新运行 `npm run build` 和 `npm test`，检查 4174 上的发布预览，再上传新的发布目录。不要直接修改 `dist/`，也不要上传整个开发工作区。
