# 历史归档

本目录保存早期原型、页面备份和历史产品文档，不参与当前平台运行或发布构建。当前入口是根目录的 [`index.html`](../index.html)，维护说明见 [项目结构](../docs/PROJECT_STRUCTURE.md)。

| 目录或文件 | 原位置 | 用途 |
| --- | --- | --- |
| `legacy-app/app.js`、`legacy-app/styles.css` | 根目录 `app.js`、`styles.css` | 早期“复现课堂”单体原型 |
| `legacy-app/product-flow.mjs` | `tests/product-flow.mjs` | 旧原型的文本标记检查 |
| `demo/` | 根目录 `demo/` | 独立的早期静态演示，保留内部相对路径 |
| `backups/` | 根目录 `backups/` | 历次设计与功能改动前的页面、脚本和样式快照 |
| `docs/` | 原 `docs/` 中的旧产品、架构、模型、状态、计划和测试文档 | 历史设计依据，不代表现有功能 |
| `docs/versions/` | 原 `docs/versions/` | V0.1 至 V5.0 的早期版本报告 |
| `docs/product-brief-2026-09-03.md` | 根目录中文长篇产品说明 | 2026-09-03 产品设想原文 |

归档主要调整位置，保留原内容。历史文档和备份中的路径描述对应当时的目录，不能直接作为当前开发步骤；部分备份依赖当时的页面环境，不作为独立可运行版本。`demo/` 内文件整体保留，便于回看原型。

需要检查旧原型时，可在项目根目录运行：

```sh
node archive/legacy-app/product-flow.mjs
```

该命令只检查旧脚本中的功能标记，不属于当前 `npm test`，也不验证当前平台。
