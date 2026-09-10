# Prompt 项目生成示例图

生成日期：2026-09-10。使用 Codex 内置 `image_gen`，五张分别生成，其中纸桥与历史提纲各进行一次针对性图像编辑。没有使用 CLI/API 图像生成路径，也没有使用程序绘图替代生图。所有入选原尺寸 PNG 已同时保存在原资料同目录和网站 `assets/covers/` 目录；原始 Prompt 未改写。源码保留两处图片，发布构建对相同内容去重，不移除原目录记录。

这些图是根据本地模板填写具体教学主题后的 AI 生成示例，均未经过真实课堂验证。图中教师设计、活动与预期证据不等同于已经发生的学生表现。网页应显示生成示例标签与每张 caption。图片中的简体中文为本次固定输出；平台切换语言不代表图片内文字会自动翻译。

## 集成

`data/generated-examples.json` 以项目 id 映射，包含网站封面 `cover`、原目录下载 `imageHref`、三语言标题与说明、原始资料路径、填参说明、生成与编辑 Prompt。横版图片建议以完整比例展示，唐朝竖版海报详情使用 `object-fit: contain`，避免裁掉底部教学内容。卡片缩略预览可以裁切，但提供查看完整图入口。

## 学科事实和核对

- 五张均目视检查主要标题、中文正文、明显学科事实、图示关系和裁切。
- 《春晓》按孟浩然原诗四行、标点与朝代核对；雨后景象暗示前一夜，无同时发生的夜雨与晨景叙事。
- 唐朝 618—907 年可查[故宫博物院《步辇图》藏品条目](https://ggzl.dpm.org.cn/pages/exhibit_works/details?id=11932)与[教育部《重编国语辞典》历代年号表](https://dict.revised.moe.edu.tw/appendix.jsp?ID=3&page=4)。其余简明要点取自本地模板的唐朝范例。本图明确不是文物照片，也不是完整满足原模板的成品。
- 张骞前138年、前119年两次出使核对[中国国家博物馆“中华史诗美术大展”](https://en.chnmuseum.cn/Portals/0/web/exhibition/exhibitions/161120Chines-Epic/)；丝路为逐渐形成的交流网络，参见[中国国家博物馆“丝绸之路”展览](https://www.chnmuseum.cn/zl/zlhg/201812/t20181220_32385.shtml)。未将示意路线当成精确地图。
- 纸桥不含测量结果。初版尺子有错误刻度，已移除；主桥折痕方向已调整，图中标注“结构示意·需实际测试”。15厘米只是原案例中的示例参数，不构成已验证的承载能力。
- 历史图初版出现后世清真寺样式，已用内置编辑删除，改成无特定宗教风格的低矮绿洲建筑。图中现代灯泡等仅为提问图标。

## pbl · 纸桥，藏着什么力量？

- 原资料：`vibe coding库/傅可晗/AI辅助PBL课程设计_提示词与使用说明_V1.1.md`
- 原目录 PNG：`vibe coding库/傅可晗/纸桥PBL-课程海报-生成示例.png`
- 网站 PNG：`./assets/covers/pbl-example.png`
- 本次填参：沿用原文现成案例：小学四年级；4课时，每课时40分钟；A4纸桥、15厘米示例跨度；以公平测试和依据证据修改为核心。图像对应可选第六步，不替代前五步课程设计。
- 改编范围：原图工具补充了少量说明性短句；已逐项目视检查。未生成任何真实学生、测试数据或课堂成效。二次编辑去除了错刻度尺，并使主桥折痕沿跨度方向排列；桥体仍仅为设计意向示意。
- 展示说明：沿用原文四年级纸桥案例制作的课程展示板：保留公平测试、修改与反思，并将结果区留给真实课堂填写。桥体为结构示意，15厘米为示例参数，需教师试做；图中载荷不代表测试结果。

完整生成 Prompt：

```text
Use case: scientific-educational.
Create a finished landscape 16:9 Chinese project-based learning classroom poster based on the original “AI辅助PBL课程设计” six-step workflow, specifically its supplied Grade 4 paper-bridge example and optional visualization step. Theme: compare paper bridge structures using fair tests; not real classroom results. This is a polished teaching display, not an app mockup or a generic stock image.
Main visual: elegant tactile cut-paper and fine watercolor illustration of an A4 paper bridge folded into a strong accordion profile, spanning two stable low tabletop wooden supports. A small set of identical wooden blocks above it, a ruler beneath marking a span labelled exactly “15厘米”. Also show a plain flat paper sample and a folded sample as candidate structures, without claiming measured results. No people. Generous warm white background with pencil construction lines, sage and deep forest green, warm ochre accents. Editorial composition: large left title, highly detailed bridge scene occupying upper right and middle, orderly five-step pathway below. Premium children's science museum information design, readable adult-teacher typography, soft natural shadows.
Text (render exactly in simplified Chinese and only this text, clean complete strokes):
“纸桥，藏着什么力量？”
“一张A4纸 · 一次有证据的设计”
“观察”
“提问”
“探究”
“创造”
“反思”
“相同纸张”
“相同跨度”
“相同载荷”
“我们的测试结果”
“留给真实课堂填写”
“15厘米”
“设计示例 · 待试教”
Create a deliberately blank, ruled “我们的测试结果” area, with no fabricated measurements, names, scores, or quotes. The five pathway labels are connected in order with fine arrows; a return arrow from reflect to explore communicates iteration. Entire poster visible with generous margins, no clipping, no heavy borders, no logos, no watermark. Paper-bridge and blank evidence panel should feel useful and inviting.
```

最终修正使用的图像编辑 Prompt（以前一张生成结果为编辑目标）：

```text
Edit the supplied paper bridge educational poster. Preserve its exact overall layout, colors, all major Chinese text, five-step learning path, blank results panel, and beautiful paper texture. Correct two scientific-diagram details only: (1) Remove the wooden ruler entirely; leave clean tabletop under the existing double-ended arrow and exact text “15厘米”. This is an illustration, not a measuring instrument. (2) Reorient the corrugation folds of the central paper bridge so its parallel ridge lines run lengthwise from the left support all the way to the right support, aligned with the span, like strong parallel paper beams. The corrugated zigzag cross-section should be visible at its short ends resting on the supports, not running across the unsupported span. Keep the same white paper and small wooden block loads, no added glue or extra materials. Remove the small explanatory sketch and assertion at the top above the bridge; replace it with the exact concise label “结构示意 · 需实际测试”. All other regions unchanged. No extra text or ruler numbers. Maintain landscape aspect ratio and image quality.
```

## poetry · 《春晓》：从画面回到诗句

- 原资料：`vibe coding库/郭尚玮/中小学古诗词课堂海报提示词(1).md`
- 原目录 PNG：`vibe coding库/郭尚玮/古诗词课堂海报-春晓-生成示例.png`
- 网站 PNG：`./assets/covers/poetry-example.png`
- 本次填参：诗题：春晓；作者与朝代：孟浩然·唐；小学低年级；横版16:9；中国水墨与淡彩；全文模式。诗文保留四行与标点。
- 改编范围：将原提示词填参后改写为等义图像规格，保留一个主体场景、诗意、全文及准确分行。画面为诗意想象，不作为作者生平或作诗地点的证据。
- 展示说明：填入孟浩然《春晓》、小学低年级、全文模式，生成水墨淡彩海报。晨光、鸟鸣与落花对应诗中线索；夜雨通过湿润环境暗示，未画成同时发生的情节。

完整生成 Prompt：

```text
Use case: scientific-educational.
Generate one finished Chinese classical poetry classroom poster using the original “中小学古诗词课堂海报提示词 V2” with these teacher inputs:
诗题：春晓
作者与朝代：孟浩然 · 唐
原文：
春眠不觉晓，
处处闻啼鸟。
夜来风雨声，
花落知多少。
适用年级：小学低年级。
画面比例：横版16:9。
画风：中国水墨与淡彩插画结合。
文字模式：全文。
Teaching intention: help pupils distinguish the morning they can see from the remembered night rain; observe birds and fallen petals then return to the exact poem.
Create a beautiful serene spring dawn garden after overnight rain, with fresh washed pale green branches, two or three small songbirds perched naturally, a few delicate pink blossoms still on branches, scattered fallen petals on moist earth and a small reflective puddle in the foreground. Dew and softly illuminated mist show the quiet morning. No person or poet portrait. Do not depict a simultaneous nighttime storm; the fallen petals and wet surfaces suggest the prior night. No invented palace, boats, pagodas, cranes, lanterns, seals, or elaborate borders. Chinese ink plus delicate translucent watercolor on fine almost-white paper, strong poetic atmosphere, clear natural scale, restrained jade green and soft petal pink. Illustration naturally fills the right two-thirds, extending delicate branches into the whole composition; the left area is clean and quiet for text. The text should be large, precise Song-style/Kai-style Chinese with complete strokes, not loose unreadable calligraphy. Title much larger than poem; preserve each supplied line. Do not add pinyin, translation, teaching instructions, labels, logo, watermark, or ANY words beyond:
“春晓”
“孟浩然 · 唐”
“春眠不觉晓，”
“处处闻啼鸟。”
“夜来风雨声，”
“花落知多少。”
Premium classroom-poster polish, beautiful balanced white space, all margins intact, landscape 16:9.
```

## dynasty · 唐朝：盛世气象与开放文明

- 原资料：`vibe coding库/郭尚玮/朝代课堂海报提示词.zip`
- 原目录 PNG：`vibe coding库/郭尚玮/唐朝课堂海报-简明插画-生成示例.png`
- 网站 PNG：`./assets/covers/dynasty-example.png`
- 本次填参：主题沿用原文唐朝范例；初中历史；A4竖版；选择经济、民族关系、对外交往、文化四区；建立—转折—灭亡时间线。
- 改编范围：明确不完整符合原模板：原文要求真实文物/遗址图片，不准AI虚构文物。本次省略实物资料图模块，改为标注“想象示意”的城坊与课堂插画；大幅精简逐条考点。完整课堂版应补真实资料图并保留来源。
- 展示说明：依据唐朝范例制作的简明插画版，保留年代、四个主题及转折线索。城坊与人物均为教学想象，非文物照片；原模板要求的真实资料图模块已省略，正式使用完整模板时需另补有来源与授权的真实资料图。

完整生成 Prompt：

```text
Use case: scientific-educational.
Generate a premium Chinese history classroom knowledge poster, A4 portrait aspect ratio, based on the local “朝代课堂海报提示词” Tang-dynasty example. This is a clearly simplified visual demonstration for lower secondary students, preserving chronology and the four subject modules, not pretending to reproduce real museum photography.
Subject: Tang dynasty, 618–907, prosperity and cultural exchange. Cream paper, deep indigo text, restrained vermilion and muted antique gold. Refined modern Chinese educational editorial design: enormous confident “唐朝” typography top left, subtitle and date below; a beautiful wide isometric ink-and-gouache drawing of ancient Chang'an-inspired walled wards and busy urban streets in the center, clearly a schematic imagining, not a real artifact or exact archaeological reconstruction. Fine small people only as period scene elements, no modern objects. Architecture inspired by Chinese Tang wooden halls and regular city wards, not Japanese pagodas. Surrounding generous typography and clear grid. Below are four compact knowledge modules with short facts plus their meaning. End with a very readable timeline and one thinking prompt. Do not generate fake museum relic photos, fake inscriptions, fake historian quotes, or real-looking artifact catalogues. No logos or watermark.
Exact simplified Chinese text to render (no extra words):
“唐朝”
“盛世气象与开放文明”
“618—907 年”
“长安城坊市格局 · 想象示意”
“贞观之治 → 开元盛世”
“经济”
“农业与手工业发展｜支撑社会生活”
“民族关系”
“文成公主入藏｜促进交流”
“对外交往”
“遣唐使与玄奘西行｜推动文化交流”
“文化”
“唐诗繁荣｜留下丰富的文学遗产”
“618 建立”
“755 安史之乱开始”
“907 灭亡”
“想一想：哪些线索体现了开放？”
“简明设计示例”
Keep every fact in its own line, pairing fact and explanation separated by ｜. Timeline is schematic event order, not proportional. No decorative faux text. Imagery about 40 percent, avoid dense textbook paragraphs. Print-worthy, high readability and sophisticated balance.
```

## history · 张骞与丝绸之路：读懂交流网络

- 原资料：`vibe coding库/卢永哲/历史趣味提纲prompt(1).zip`
- 原目录 PNG：`vibe coding库/卢永哲/历史趣味提纲-张骞与丝绸之路-生成示例.png`
- 网站 PNG：`./assets/covers/history-example.png`
- 本次填参：七年级；张骞与丝绸之路；新课导入/探究；单章一页；中文白板图片；围绕时间排序与交通交流关系筛选重点；基础与进阶两层问题。
- 改编范围：概念联系图不按比例，不作精确地理路线。图像初版混入后世伊斯兰建筑，已通过二次生成编辑移除，替换为无特定宗教风格的低矮绿洲聚落。底部灯泡等为当代教学图标，不代表汉代物品。
- 展示说明：填入七年级“张骞与丝绸之路”，以双时间点、地区联系与分层问题组织一页白板。前138年、前119年已核对；路线和人物均为教学示意，交流网络并非由一次出使凭空建立。

完整生成 Prompt：

```text
Use case: scientific-educational.
Produce one finished landscape 16:9 historical learning-outline whiteboard image based on the original “通用趣味历史学习提纲 Prompt”.
Teacher inputs: Grade 7 lower secondary; topic 张骞与丝绸之路; new-lesson exploration; pupils can sequence BCE dates with guidance; Chinese; one chapter on one page; select key facts for the specific goal. The board must fill the frame, no classroom or physical board frame. Clean off-white surface, exceptionally legible dark ink lettering, delicate hand-drawn teaching diagrams, teal, rust and ochre markers, professional and engaging without looking childish.
Large title top left. Dominant middle scene: an evocative but explicitly schematic caravan silhouette moving through pale desert dunes, small route diagram beneath connecting four region labels from left to right. This is a conceptual connection diagram, not a geographically accurate map. Two-date timeline at upper right, generous comparison/question panel at bottom. Use compass-like marks sparingly, no false scale or arbitrary national borders. Core idea: Silk Roads are a developing network of exchanges, not a single road created from nothing by one person. Images are educational imagination, not real historical artifacts.
Text, verbatim simplified Chinese, no extra text:
“张骞与丝绸之路”
“从一次出使，读懂交流的网络”
“学习目标：按序说事，用线索解释交流”
“公元前138年”
“张骞第一次出使西域”
“公元前119年”
“张骞第二次出使西域”
“长安”
“河西走廊”
“西域”
“更远的地区”
“联系示意 · 非精确地图”
“丝绸之路是逐步发展的交通与交流网络”
“看图找线索”
“除了商品，还有什么会随人流动？”
“基础：排一排两次出使的时间”
“进阶：说明交通怎样帮助文化交流”
“教学想象示意”
Use only a few camel and human silhouettes for the small caravan, no caricatures or stereotypes, no fabricated artifact details. Prioritize correct Chinese, timeline order 138 BCE before 119 BCE, clearly visible arrows labeled by context. Beautiful balance of historical atmosphere, real learning structure, and clean whiteboard readability.
```

最终修正使用的图像编辑 Prompt（以前一张生成结果为编辑目标）：

```text
Correct the supplied educational whiteboard image while preserving all Chinese wording verbatim, typography, all arrows, the 138 BCE / 119 BCE timeline, colors, composition, caravan, and bottom teaching activities. The image is about Zhang Qian in the Han dynasty. Remove every Islamic mosque, minaret, onion dome and Islamic crescent, which are anachronistic to this Han-dynasty context: this includes the large city scene on the far right of the dunes and the small blue icon above the words “更远的地区”. Replace the large far-right city with simple neutral low mud-brick flat-roofed buildings at a desert oasis with palm trees, no distinctive religious or later architectural style. Replace the small blue icon with a quiet mountain pass and a small oasis tree. The small green “西域” landscape may remain simple tents and a tree. Do not add any new dates, symbols, labels or words. Do not modify any other parts. Keep “联系示意 · 非精确地图” and “教学想象示意” fully visible, preserve fine clean artwork and wide aspect ratio.
```

## lesson · 《春》：从感官描写走向读写迁移

- 原资料：`vibe coding库/陈捷/现代文教案通用格式.md`
- 原目录 PNG：`vibe coding库/陈捷/现代文教案-朱自清春-设计概览示例.png`
- 网站 PNG：`./assets/covers/lesson-example.png`
- 本次填参：朱自清《春》；七年级；一课时40分钟设计示例；围绕感官描写组织朗读—文本细读—读写迁移；学习证据为批注、交流与修改后的片段。
- 改编范围：原文件并非直接生图Prompt。本次依据其目标、教学过程、板书与评价要求追加图像规格，生成教学设计概览；未生成全部十二部分教案，未引用或虚构原作句子。
- 展示说明：原文是教案结构模板，本图是填入朱自清《春》后制作的七年级一课时设计概览，串起朗读、细读、迁移与学习证据。未代替完整教案，也未编造实际课堂表现。

完整生成 Prompt：

```text
Use case: scientific-educational.
Create an elegant landscape 16:9 modern Chinese reading-lesson design overview, a visual worked example based on the original “现代文教案通用格式” with topic 朱自清《春》, Grade 7, one 40-minute example lesson focused on sensory language and descriptive writing. This template is for teaching plans; visualize an example plan and board design, do not present it as the original text output or an already taught successful lesson.
Premium editorial education poster on luminous cream-white paper: left third dominated by an exceptionally beautiful small ink-and-watercolor spring meadow vignette, with new grass, rain-softened budding branches, and a flowing pale green landscape that subtly blends into the page. A crisp open notebook with a pencil integrates at the bottom edge, but do not fill the notebook with illegible fake text. Right two-thirds clear structured typography with thin quiet dividers and three core steps, plus a broad lower strip for practice and evidence. Sophisticated emerald, muted celadon, and a little coral. No person, no student portrait, no invented quotes, no stock-photo look. Give the subject “春” a large distinctive literary treatment while all supporting Chinese remains precise and readable.
Render exactly these supplied words and no extra words:
“春”
“朱自清”
“七年级现代文 · 一课时设计示例”
“从感官描写，读出春天”
“01 朗读与感知”
“圈画景物，梳理画面”
“02 文本细读”
“寻找视觉、听觉与触觉描写”
“03 读写迁移”
“写一段校园春景，并说明用词”
“学习证据”
“批注 → 交流 → 修改后的片段”
“评价关注”
“有文本依据 · 描写具体 · 修改有理由”
“设计示例 · 待试教”
Do not quote or invent sentences from the literary work. Ensure the learning objective, activity, and evidence visually relate, with a modest flow line linking reading, evidence, and writing. Ample negative space, no dense full lesson plan, no ratings, no fake classroom data, no app UI framing, no logo, no watermark.
```


