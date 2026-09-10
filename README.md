# 他山 · Tashan

读取本地教学可视化与 Prompt 的静态展示平台。唯一主页面是 `index.html`，作品预览页面是 `project-preview.html`。默认浅色，支持简体中文、繁體中文和 English，保留“凿石成玉”开场与精选作品轮播。

## 本地开发

需要 Node.js 与 Python 3；当前平台没有需要安装的 npm 依赖。

```sh
npm start
```

打开 [本地平台](http://127.0.0.1:4173/)。修改 `vibe coding库/` 或 `data/` 后运行 `npm run catalog` 并刷新页面。请通过 HTTP 服务访问，不要直接双击 HTML 文件。 仓库保留生成的目录与译文快照，下载后也能直接通过静态 HTTP 服务预览；修改原资料后仍需重新生成。

## 构建与上传

```sh
npm run build
npm test
npm run preview
```

构建生成可直接上传的 `dist/` 和 `releases/tashan-site.zip`。在 [发布预览](http://127.0.0.1:4174/) 检查后，将 `dist/` 内的文件上传至静态托管根目录，或解压 ZIP 后上传；入口文件位于包的根目录。只需上传发布产物，历史归档和本地开发依赖不进入发布包。

项目使用相对资源路径与 hash 路由，也支持部署在子目录。平台没有服务器、账号或云端资料同步；部分原始互动项目使用外部 CDN，需要联网。详见 [部署说明](docs/DEPLOYMENT.md)。

## 当前内容

- 14 个本地项目：9 个可视化作品、5 个 Prompt / 教案模板。
- 5 张生成示例图，原尺寸图片保留于原资料同目录。
- 三语教学建议、项目来源、验证记录、Prompt 原文与下载入口。
- 项目筛选、收藏、继续创作、工作台、本地上传与隔离预览。
- IndexedDB 保存上传资料与草稿，支持编辑、删除和 JSON 备份导入。

上传资料保存在当前浏览器的站点存储中，不会写回源资料目录或自动成为公开项目。改名后的入口沿用原存储；更换协议、域名、端口或浏览器时，应先在工作台导出备份，再到新站点导入。当前备份覆盖上传项目和草稿，收藏及创作任务需另外记录或复制。

## 维护文档

- [项目结构与命名](docs/PROJECT_STRUCTURE.md)
- [构建、预览与静态部署](docs/DEPLOYMENT.md)
- [本地内容与目录维护](docs/LOCAL_LIBRARY.md)
- [本地存储与备份](docs/LOCAL_STORAGE.md)
- [示例图与生成记录](docs/PROMPT_IMAGE_EXAMPLES.md)
- [教学建议与参考资料](docs/TEACHING_REFERENCES.md)
- [开场动效](docs/TASHAN_ENTRANCE.md)
- [功能验证记录](docs/CORE_WORKFLOWS_QA.md)
- [历史原型与文档](archive/README.md)

教学建议与生成示例供演示和备课参考，不代表真实课堂结果。原文件与已有验证记录仍可核对。
