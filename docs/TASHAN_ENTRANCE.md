# 他山：原石入场

正式主入口为 `index.html`，旧 `teacher-practice-demo-v3.html` 仅作兼容跳转。品牌已覆盖页面标题、导航、页脚和三语界面。三语界面统一使用中文品牌「他山」，英文辅助标识为 TASHAN。

## v3.3.0-dev.2 展示方式

- 未登录时，账号表单直接嵌入原石场景；输入、报错和管理员重置后的改密都留在这个场景中。
- 账号密码验证失败不播放动效。新账号验证成功后，自动从原石进入碎玉、玉璧显露与平台名称，无需再点击原石。
- 动效结束后始终进入发现页首页顶部。游客因收藏或上传触发登录，也遵循同一落点，不自动返回原操作。
- “游客模式”直接关闭登录场景、进入公开项目库；可以浏览与体验，个人保存、上传及工作台仍需登录。
- 登录与强制改密状态不能用 Escape 或点石绕过。动画播放和手动回放可跳过；减少动态效果时快速进入。
- 恢复已有会话不重复播放。页脚“重播开场”保留手动点石体验；`?intro=1` 不绕过账号流程。

退出场景时清空输入、释放渲染器、撤掉键盘焦点和读屏状态，并移除旧图层与入场变换类，避免转场结束后留下覆盖层或装饰线。以上说明当前实现，尚不代表本版本各浏览器与尺寸均已验收。

## 实现

`assets/js/entry-ceremony.js` 管理入口、语言、焦点与生命周期。`assets/css/entry-ceremony.css` 是独立的墨绿序章样式。`assets/js/entry-stone-scene.js` 构造程序化石壳、玉璧、凿子及火花；Three.js 0.160.1 保存在 `assets/vendor/` 并保留 MIT 许可。无需 CDN、外部模型或纹理请求。

材质使用程序化矿物纹理和玉石云纹；主体程序生成。没有引入 React 或复制 React Bits 组件源代码，避免改变已有原生项目结构。

减少动态效果偏好下关闭悬浮和视差，登录后迅速进入。提供暂停按钮和覆盖输入框、按钮的 Tab 焦点约束；Escape 仅用于跳过播放或回放，不绕过登录。WebGL 不可用时保留可点击的本地 SVG 插图。异步模块加载会核对当前开场序号，已关闭的场景不再挂载；关闭时释放动画帧、观察器和 GPU 资源。场景只在入场打开时加载与运行。

## 参考（2026-09-10 查阅）

- [Showreel · i-reel Showreel 2026](https://showreel.design/videos/i-reel-showreel-2026/)：3D 品牌片方向。
- [I-RÉEL · Merveille d’émeraude](https://www.i-reel.fr/portfolio/van-cleef-arpelsmerveille-demeraude/)：聚光与宝石材质呈现，原片拍摄的是祖母绿珠宝，凿石与玉璧叙事为本项目原创。
- [React Bits · Click Spark](https://reactbits.dev/animations/click-spark)：点击时短促放射火花的交互参考。
- [React Bits · Blur Text](https://reactbits.dev/text-animations/blur-text)：文字由模糊转清晰的节奏参考。

## 检查

`npm run build` 检查入口资产及经典脚本、ES Modules 语法；`npm test` 执行项目数据、存储与账号相关检查。它们不代替真实浏览器中的动效和焦点验收。

`tests/entrance-scene.html` 为独立视觉检查页，复用同一渲染器，显示原石、0.65 秒剥落、1.3 秒玉璧三个静止关键帧，不改变正式页面的播放流程。

当前版本需分别验证登录失败、成功、新账号直接入场、个人页主动改密、重置后的改密、游客进入、跳过、回放、三语切换和手机布局，并检查关闭后无残留场景节点及变换样式。具体结果由 [账号版检查记录](ACCOUNT_VERSION_QA.md) 维护，旧版本的视觉检查不能替代本轮验收。
