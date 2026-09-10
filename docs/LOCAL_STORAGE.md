# 本地资料保存与恢复

`assets/js/storage.js` 提供 `window.PracticeStore`，使用当前站点来源下的 IndexedDB 数据库 `tashan-practice-library`（版本 1）。项目元数据、原始附件和封面以 Blob 形式在同一事务保存；不会上传到远程服务器。更换浏览器，或更换协议、域名、端口，会进入不同的资料库。同一来源下仅改入口文件名或目录，不影响已有项目和草稿。清理网站数据会删除资料，因此页面提供 JSON 备份。

## 接口

所有方法均返回 Promise。`list()` 按更新时间倒序返回完整项目；`get(id)` 返回项目或 `null`。`put(record)` 新建或更新；无 ID 时创建 `local-…`，同一 ID 更新，自动维护 ISO 格式 `createdAt` 和 `updatedAt`。`remove(id)` 删除项目与其附件。`getDraft()`、`putDraft(record)` 和 `clearDraft()` 操作一份独立的编辑草稿。

完成项目时可调用 `put(record, {clearDraft:true})`，在同一个事务内保存项目并移除草稿。这样不会因草稿和完成作品的附件重复计算而误触容量限制；如果项目写入失败，草稿也会完整保留。界面在此操作期间需要锁定新建、导入等会切换草稿的操作。

项目字段由界面负责，存储模块允许普通对象、数组、文字、有限数字、布尔及 null；不允许函数、循环引用和不可移植的运行时对象。单个项目文字资料不超过 1 MB。文件只放在以下字段：

```js
{
  id: 'local-optional-id',
  title: { 'zh-CN': '圆的探索', en: 'Exploring circles' },
  attachment: { name: 'project.html', type: 'text/html', blob: file },
  coverFile: { name: 'cover.png', type: 'image/png', blob: imageFile }
}
```

附件上限 20 MB，封面上限 5 MB。附件扩展名支持 HTML、HTM、ZIP、MD、Markdown、TXT、JSON、PDF、DOCX、PPTX、PNG、JPG/JPEG、WebP、GIF；封面支持 PNG、JPEG、WebP、GIF。空 MIME 可由扩展名补全。整个资料库（包括草稿）上限 100 个项目、50 MB。错误通过 Error 拒绝，QuotaExceededError 的名称保留，便于界面提示浏览器空间不足。

## 备份

`exportAll()` 返回 JSON Blob，只包含当前资料库中的项目和草稿，不读取其他 localStorage 数据。格式是 `{format:'tashan-practice-library',version:1,exportedAt,projects,draft}`；文件内容在 JSON 中以 `{name,type,base64}` 表示。`importBackup(file)` 接受此备份，返回 `{count}`。

导入先验证全部数据与附件，再在单一事务内进行容量检查和写入。遇到已存在的项目 ID 会产生新 ID，保留原项目。当前已有草稿时会保留当前草稿；没有草稿时恢复备份草稿。解析、验证、容量或事务失败都不会造成部分导入。备份文件上限 70 MB，对应 base64 编码后的 50 MB 资料容量。

## 验证

运行 `node tests/library-storage.mjs`。该检查通过 Node 14 兼容的内存事务适配器测试文件往返、编辑、草稿、冲突处理、非法备份、容量和注入写入失败后的整体回滚。它不能代替浏览器自身的 IndexedDB 兼容性；还需在平台中完成上传、刷新、编辑、备份恢复的浏览器验收。

## 上传 HTML 的本地预览

`project-preview.html?project=local-ID` 从相同 IndexedDB 中读取附件，支持自包含 HTML。外层页面提供返回项目和下载原始文件，界面根据 `practice-language` 显示简体、繁体或英文。

项目 HTML 只进入 `sandbox="allow-scripts"` 的 iframe，未授予同源、弹窗、下载、表单或顶层导航能力。原 HTML 之前注入限制性 CSP，允许行内脚本/样式、内嵌图片等，禁止联网请求、外部脚本、对象和嵌套框架。上传代码不能访问平台的 DOM 或本地资料库。需要多个配套文件的作品先下载解压，再按照原项目说明运行；预览器不会尝试解压和执行 ZIP。
