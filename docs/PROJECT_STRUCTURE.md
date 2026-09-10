# 项目结构与命名

主站统一使用 `index.html`，本地作品预览使用 `project-preview.html`。旧的 `teacher-practice-demo-v3.html` 和 `local-project-preview.html` 仅做兼容跳转，保留查询参数和 hash；只修改正式入口，不再维护两份界面。

```text
software/
├── index.html                    # 正式主页面
├── project-preview.html          # 上传 HTML 的隔离预览
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
├── scripts/                      # 目录生成、构建与检查
├── tests/                        # 当前平台的功能与存储检查
├── docs/                         # 当前维护文档
├── archive/                      # 旧原型、旧文档与改动前备份
├── dist/                         # 构建生成，可直接上传
├── releases/tashan-site.zip      # 构建生成的上传包
└── package.json                  # 名称 tashan 与统一运行命令
```

## 运行文件

| 文件 | 职责 |
| --- | --- |
| `assets/js/app.js` | 页面渲染、hash 路由、筛选、收藏、创作与工作台 |
| `assets/js/storage.js` | IndexedDB 项目、附件、草稿与备份 |
| `assets/js/project-preview.js` | 上传 HTML 的隔离运行与源文件下载 |
| `assets/js/icons.js` | 平台图标 |
| `assets/js/project-showcase.js` | 首页精选作品轮播 |
| `assets/js/entry-ceremony.js` | 开场流程与交互 |
| `assets/js/entry-stone-scene.js` | 石头与玉芯的三维场景 |
| `assets/css/app.css` | 主站界面与响应式样式 |
| `assets/css/project-preview.css` | 作品预览界面样式 |
| `assets/css/entry-ceremony.css`、`assets/css/project-showcase.css` | 开场与轮播组件样式 |
| `assets/data/catalog.js`、`assets/data/translations.js` | 供浏览器读取的生成数据 |

文件名使用小写英文与连字符；功能模块按职责命名，不将版本号、日期或“demo”写进正式入口名称。中文标题和原资料文件名属于教学内容，保留原样，运行路径由构建程序处理。

## 内容的单一来源

`data/catalog-curation.json` 登记展示项目与源资料路径，`data/interface-translations.json` 集中管理界面译文。原先独立的流程译文已合并到同一个词典。教学建议、验证记录与生成图记录仍分别存放在 `data/teaching-analysis.json`、`data/verification.json`、`data/generated-examples.json`。

执行 `npm run catalog`，读取资料并生成 `data/generated/catalog.json`、`data/generated/prompts/`、`assets/data/catalog.js` 和 `assets/data/translations.js`，同时刷新入口中的资源版本标记。请修改输入文件，不要直接编辑生成文件。

`vibe coding库/` 保留原资料和用户要求另存于原目录的示例 PNG。相同内容的资料不会因此重复展示；发布构建只收集需要的内容，并合并可安全复用的相同文件。项目 HTML 的配套相对资源结构与原下载包保持完整。

## 历史文件与发布产物

`archive/` 保存旧原型和历史备份，不进入发布包。详细移动记录见 [归档说明](../archive/README.md)。

`dist/` 与 `releases/tashan-site.zip` 是生成产物。每次修改后重新构建，不直接修改发布目录；否则下次构建会覆盖修改。发布方式见 [部署说明](DEPLOYMENT.md)。

## 浏览器数据兼容

整理目录不修改项目 ID、localStorage 键或 IndexedDB 数据库名称。相同协议、域名和端口下，入口改名继续使用现有收藏、上传项目及草稿。部署到新的站点来源时，按 [本地存储说明](LOCAL_STORAGE.md) 导出和导入备份。
