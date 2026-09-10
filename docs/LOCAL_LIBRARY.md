# 他山 · 本地展示库

当前正式主页面为 `index.html`。旧 `teacher-practice-demo-v3.html` 仅兼容跳转，并保留查询参数和 hash。旧页面修改前备份在 `archive/backups/teacher-practice-demo-v3.before-library.html`。

## 运行和更新

```sh
npm start
npm run build
npm test
```

打开 http://127.0.0.1:4173/ 。`npm start` 先读取本地内容再启动静态服务器；服务已在运行时，修改资料后运行 `npm run catalog` 并刷新即可。

## 来源

目前展示 14 个条目：9 个教学可视化、5 份 Prompt / 教学模板。来源是 `vibe coding库/` 内各贡献目录；姓名仅表示目录来源，未据此认证作者。重复 HTML 按 SHA-256 合并，原始目录不做修改。ZIP 内的 Markdown 读取到 `data/generated/prompts/`，无需解压或运行包内代码。

- `data/catalog-curation.json`：展示条目、三语简介、建议学段、前置基础、原始文件、关联 Prompt 和下载包。简介及教学建议为展示整理。
- `data/verification.json`：带日期、范围和证据的人工检查记录。
- `scripts/build-catalog.py`：读取原文件，生成 `data/generated/catalog.json` 与 `assets/data/catalog.js`。新增项目需先在 curation 中登记并提供封面。
- `data/interface-translations.json`：简中字符串对应的繁中、英文界面译文，包含核心流程译文，构建时输出 `assets/data/translations.js`。
- `assets/covers/`：9 个项目的实际运行截图，以及 5 张生成的 Prompt 示例。
- `data/teaching-analysis.json`：14 项三语教学建议与参考链接，详见 `TEACHING_REFERENCES.md`。
- `data/generated-examples.json`：示例图的源路径、完整生成提示词、填参和编辑记录；图片另存原资料同目录。

原项目在独立标签页打开，相对路径的配套资源仍在原目录中。详情提供原文件或已有的完整项目包；压缩包内部结构沿用本地原件。

## 验证状态

地球公转与 C++ 模拟器已有基础运行检查。圆锥曲线保留基础运行证据，但概念复核发现固定 a=1 椭圆的极限被误述为抛物线；化学解析把溴乙烷误写为乙醇，这两项标记“内容待修订”。5 个 Prompt 已生成并目视检查示例，但原模板完整复现与课堂试教仍待验证。没有任何条目被标记为课堂成效已验证。具体操作记录见验证数据。

## 当前功能与边界

默认浅色；简体、繁体、英文可切换，记住语言。原始 Prompt、原项目中的文字保持原文。支持搜索、类别、学科、学段和验证状态筛选，以及地区年级选项；现有条目只整理到学段，没有捏造精准年级，因此默认包含未限定年级的项目。

收藏与创作任务保存在 localStorage；上传项目、附件、封面和草稿保存在 IndexedDB。三步流程会实际加入本地项目库，可再次编辑或删除；离开上传页会保存草稿，失败会提示。备份导入原子写入并对冲突 ID 另存，保留已有草稿。工作台提供下载、复制与查看备份 JSON 的入口。备份范围不包括收藏和任务说明，后者可单独复制。

自包含 HTML 由 `project-preview.html` 在仅允许脚本的 sandbox 中运行，不能读取平台存储或联网。ZIP 及依赖配套资源的项目可下载后本地运行。上传不会改写 `vibe coding库`，没有账号、远程 AI、服务器发布或跨设备同步服务。

## 设计实施

已安装并应用 UI UX Pro Max Skill（nextlevelbuilder/ui-ux-pro-max-skill），结合已安装的 Taste Skill。针对教师资源平台，保留深绿品牌，用浅底、清晰的标题层级、真实项目截图、低干扰状态标签与一致的间距组织内容。未采用检索结果中面向儿童的糖果色风格。

平台界面无需远程字体或运行时 CDN；部分原始互动项目仍有外部依赖，详见发布清单。图标为本地 Tabler SVG，许可在 `assets/icons/LICENSE`。支持键盘焦点、跳至正文、反馈提示、减少动效设置及单列/双列/三列响应式布局。

构建检查以当前 `index.html` 和发布产物为准；目录测试核对本地文件哈希、Prompt 原文、封面与下载链接、三语元数据及验证证据。旧原型保存在 `archive/legacy-app/`，可单独运行 `node archive/legacy-app/product-flow.mjs`；它不代表当前页面交互验证。


### 首页精选作品轮播

首页右侧展示 5 个本地精选项目，名单在 `assets/js/project-showcase.js` 的 `ids` 中维护。主图打开项目详情，右侧预览切换到下一件作品，左右箭头与圆点可直接选择。箭头默认隐藏，鼠标悬停作品或键盘聚焦时才显示；移开鼠标后隐藏，触屏可用圆点或滑动切换。支持左右滑动和方向键；每 8 秒自动切换，可手动暂停。鼠标移入、页面隐藏或展示区移出视口时暂停；手动选择后需点击播放才继续。遵循减少动态效果设置，默认不自动轮播。图标随组件本地保存，不依赖远程服务。
