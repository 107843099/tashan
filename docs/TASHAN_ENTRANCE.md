# 他山：原石入场

正式主入口为 `index.html`，旧 `teacher-practice-demo-v3.html` 仅作兼容跳转。品牌已覆盖页面标题、导航、页脚和三语界面。三语界面统一使用中文品牌「他山」，英文辅助标识为 TASHAN。

## 展示方式

- 新标签页第一次打开首页，先展示入场。点原石或下方文案触发一次完整雕琢；无需连续点击。
- 轻微悬浮原石 → 凿击与短促火花 → 石壳剥落 → 玉璧显露 → 平台名称 → 浅色项目库。
- 点击后的动效约 2.2 秒，再淡出 0.65 秒。可随时点「直接进入」或按 Escape。
- 同一标签页已经进入过会跳过开场；页脚「重播开场」可再次演示。
- 展示用链接：`index.html?intro=1`，每次打开都展示开场。
- 正常详情深链接不被入场阻挡（显式 `intro=1` 除外）。

## 实现

`assets/js/entry-ceremony.js` 管理入口、语言、焦点与生命周期。`assets/css/entry-ceremony.css` 是独立的墨绿序章样式。`assets/js/entry-stone-scene.js` 构造程序化石壳、玉璧、凿子及火花；Three.js 0.160.1 保存在 `assets/vendor/` 并保留 MIT 许可。无需 CDN、外部模型或纹理请求。

材质使用程序化矿物纹理和玉石云纹；主体程序生成。没有引入 React 或复制 React Bits 组件源代码，避免改变已有原生项目结构。

减少动态效果偏好下关闭悬浮和视差，点击迅速进入。提供暂停按钮、Tab 焦点约束和 Escape。WebGL 不可用时保留可点击的本地 SVG 插图。延迟完成的模块不会覆盖已经开始的后备动效；关闭时释放动画帧、观察器和 GPU 资源。场景只在入场打开时加载与运行。

## 参考（2026-09-10 查阅）

- [Showreel · i-reel Showreel 2026](https://showreel.design/videos/i-reel-showreel-2026/)：3D 品牌片方向。
- [I-RÉEL · Merveille d’émeraude](https://www.i-reel.fr/portfolio/van-cleef-arpelsmerveille-demeraude/)：聚光与宝石材质呈现，原片拍摄的是祖母绿珠宝，凿石与玉璧叙事为本项目原创。
- [React Bits · Click Spark](https://reactbits.dev/animations/click-spark)：点击时短促放射火花的交互参考。
- [React Bits · Blur Text](https://reactbits.dev/text-animations/blur-text)：文字由模糊转清晰的节奏参考。

## 检查

`npm run build` 检查入口资产及经典脚本、ES Modules 语法；`npm test` 校验原本地项目数据。

`tests/entrance-scene.html` 为独立视觉检查页，复用同一渲染器，显示原石、0.65 秒剥落、1.3 秒玉璧三个静止关键帧，不改变正式页面的播放流程。

浏览器实际检查了入场首屏、单击后进入、Escape、初始 Shift+Tab、回放、三语切换、再次加载跳过、资源节点移除，以及桌面/手机竖屏/手机横屏布局。原始教学项目与 Prompt 保持原样。
