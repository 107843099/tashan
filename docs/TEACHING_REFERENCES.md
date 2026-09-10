# 项目教学适配与资料核对

更新日期：2026-09-10。对应 `data/teaching-analysis.json` 的 14 个本地项目。

这些说明先读取本地 HTML、配套脚本呈现的教学功能以及 Prompt 原文，再结合课程文件、学科教材和教学机构的一手资料整理。**学段、课时、课堂活动与学习证据是编辑建议，尚无真实试教记录；来源支持知识与设计原则，不代表这些项目获得机构认证或证实有效。** 原始文档里的生成要求只作为项目内容分析，未据此运行或上传外部服务。

## 如何使用

- 先看 `audience` 与 `prior` 判断学生是否具备基础；年级不代替实际学情。
- `objective`、`activities` 与 `evidence` 构成可试教的设计起点；`duration` 是估计，不是实测课时。
- `limitation` 包含模型边界和已识别内容问题。运行按钮正常与知识准确是两项不同检查。
- 三种语言只翻译平台建议。原始诗文、代码与 Prompt 保持原样，不据界面语言擅自改写。
- 新增课堂记录时填写实际学生任务、条件与证据，不能把本文件的预测、预设回答或生成图视为真实反馈。

## 本地内容审阅与建议落点

| 项目 | 已审阅的关键功能或原文结构 | 建议落点 |
| --- | --- | --- |
| earth | 日期、纬度、黄赤交角、直射点、昼长与太阳高度 | 初中定性解释；高中控制变量与定量推理 |
| chemistry | 甲烷氯代、原子追踪、取代判断题、ATP 模块 | 高中共价键/有机结构后；净变化与完整机理分开 |
| mendel | 亲本选择、配子、棋盘、测交、闯关与迁移题 | 高中遗传；区分基因型/表现型与概率/样本 |
| conics | 四视图、e/a/b/c、动点距离、e=1 过渡解释 | 高中解析几何；先纠正下述概念误述 |
| cpp | 输入、变量、数组、赋值、循环与逐步执行 | 初中到高中编程基础；概念逐个学习 |
| lens | 三条特殊光线、物距/焦距、像距/倍率、实虚说明 | 初中定性成像；计算与符号作延伸 |
| pinhole | 装置/光路/光屏视图、物点、L/u、孔径与模糊 | 初中光学；小学高年级可定性观察 |
| gcd | 1–500 正整数矩形切割、商余算式、停止条件 | 小学高年级拓展或初中整数；不是强称必修 |
| recursion | 调用/返回、每层参数、栈、b=0 与取余 | 已学函数和辗转相除法的进阶学生 |
| pbl | 基础信息、六个递进 Prompt、教师确认、反馈修改和试教记录 | 教师备课；先选一个具体学段与可行项目 |
| poetry | 教师填原文、诗意/关键字词、虚实、全文/标题/无字模式 | 从读诗到观图，再回到文本；保留多种合理解释 |
| dynasty | 通用 A4 模板、唐朝成品 Prompt、真实资料图和逐点解析要求 | 初中复习；分主线/专题，注意史料图性质 |
| history | 提取资料、分层目标、按主题选结构、趣味活动和自测 | 初中历史默认；史实/解释/虚构情境分清 |
| lesson | 文体、学情、五类目标、六环节过程、评价、迁移与反思 | 教师备课结构；不强行填满所有目标类别 |

## 需要优先处理的内容问题

1. **conics：固定半长轴不能直接拼接为抛物线。** 本地原页写出固定 a=1 的椭圆在 e=1 时“退化成开口的抛物线”，并称 y²=4x 的焦点(1,0)在顶点。前者的固定尺度极限是线段；后者顶点为(0,0)。e=1 的抛物线应由焦点—准线距离比解释，不能直接套用椭圆的半长轴归一化。平台建议已注明须纠正；未改原源文件和运行验证状态。
2. **chemistry：一道水解反馈误名。** 现有运行检查记录已指出解释把溴乙烷写成乙醇；平台教学建议再次标记。动画展示净键变化，不作为实际自由基链式机理的逐帧再现。
3. **mendel：结果是模型概率。** 单基因、完全显性、随机结合是前提；少量子代全显性不能确定亲本为显性纯合子，样本越多只能增强证据。
4. **pinhole / lens：模型不覆盖全部真实光学。** 前者省略衍射并提亮显示；后者使用薄透镜近轴近似。二者的教材适配建议均保留边界。
5. **生成图示例：** 图片需逐字核对；诗歌图是解读，历史示意不是馆藏实拍。朝代模板原文明确要求真实资料图片，生成示意若改写此要求，应明示为演示性适配并保留原 Prompt。

## 资料与版本

以下链接均于本次检索中找到并读取了与分析有关的内容或摘要；只列实际用于 JSON 的 18 项。香港初中科学 2025 框架处于试行/逐级实施过渡期：文件说明 2025/26–2026/27 可试行，2027/28 起从中一逐级实施；不能声称当前所有学校统一使用。CSTA 使用注明年份的 2017 文件作能力参考，并不称其最新版本。国际资料用于核验知识或教学设计，不能据此宣称已经完成内地/香港课程逐条对齐。


1. [NASA · What Causes the Seasons?](https://spaceplace.nasa.gov/seasons/en/)。用于 earth：用于核实地轴倾斜与四季关系，辨别“距离太阳近所以是夏天”的误区。

2. [EDB · Science (S1–3) Curriculum Framework (2025)](https://www.edb.gov.hk/attachment/en/curriculum-development/kla/science-edu/JS_Science_Curriculum_Framework_2025_english.pdf)。用于 earth, lens, pinhole：参考科学探究、模型与证据的组织方式。2025/26–2026/27 可试行，2027/28 起从中一逐级实施；不称目前全校统一采用。

3. [RSC Education · Organic chemistry starters 16–18](https://edu.rsc.org/resources/organic-chemistry-starters-16-18/4010274.article)。用于 chemistry：用于核实甲烷氯代的自由基链式取代与适合的先备知识，避免把净变化动画当成完整机理。

4. [OpenStax · Bond Dissociation Energies](https://openstax.org/books/organic-chemistry/pages/6-8-describing-a-reaction-bond-dissociation-energies)。用于 chemistry：核实断键需要能量，用于 ATP 延伸模块中“断键直接放能”误区的辨析。

5. [OpenStax · Laws of Inheritance](https://openstax.org/books/concepts-biology/pages/8-2-laws-of-inheritance)。用于 mendel：核实单因子杂交、棋盘法与预期比例；将模型概率与有限样本观察区分。

6. [EDB · Biology (S4–6) Curriculum and Assessment Guide](https://www.edb.gov.hk/attachment/en/curriculum-development/kla/science-edu/Bio_C_and_A_Guide_updated_e_20151126.pdf)。用于 mendel：以高中生物的遗传主题为学段参考，具体教学顺序由学校课程决定。

7. [OpenStax · Conic Sections](https://openstax.org/books/calculus-volume-3/pages/1-5-conic-sections)。用于 conics：用于核实焦点—准线定义、离心率分类与椭圆/双曲线的 c/a；不把 c/a 直接套用于抛物线。

8. [B.C. Curriculum · Mathematics 12: Foundations](https://curriculum.gov.bc.ca/sites/curriculum.gov.bc.ca/files/curriculum/mathematics/en_mathematics_12_foundations-of-mathematics_elab.pdf)。用于 conics：高中课程将圆锥曲线与轨迹、作图及应用联系；仅作学段参考，不等同本地课程条目对齐。

9. [CSTA · K–12 Computer Science Standards (2017)](https://csteachers.org/wp-content/uploads/2025/03/2017-csta-k12-computer-science-standards-al.pdf)。用于 cpp：使用明确标年的 2017 版变量、控制结构和分解条目作能力进阶参考；不声称是最新版本或已经通过 CSTA 对齐审查。

10. [OpenStax · Thin Lenses](https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses)。用于 lens：核实薄透镜公式、实像/虚像与像距符号；该教材用于知识核验，不作为初中阅读要求。

11. [Exploratorium · Pringles Pinhole](https://annex.exploratorium.edu/science-explorer/pringles_pinhole.html)。用于 pinhole：以可操作的暗箱活动核实小孔筛选光线、屏上形成倒像，并连接实体观察。

12. [Yale · Euclid’s Algorithm](https://www.cs.yale.edu/homes/aspnes/pinewiki/EuclidsAlgorithm.html)。用于 gcd, recursion：核实取余前后公因数保持不变及递归出口；大学讲义用于教师理解算法，不用于确定小学必修内容。

13. [Princeton · Euclid.java](https://introcs.cs.princeton.edu/java/23recursion/Euclid.java.html)。用于 recursion：用递归与循环两种欧几里得算法核对参数更新和 b=0 的返回条件；示例语言不同但算法相同。

14. [PBLWorks · Gold Standard Project Design](https://www.pblworks.org/what-is-pbl/gold-standard-project-design)。用于 pbl：参考真实问题、持续探究、学生选择、反思、反馈修改与公开成果；本地六步 Prompt 是作者工作流。

15. [EDB · 中國語文課程指引（小一至小六）2023](https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/curriculum-documents/Primary_Chi_Lang_Curr_Guide_2023.pdf)。用于 poetry：参考文学感受、审美与读写听说的结合；具体诗篇与年级仍须依据采用的教材。

16. [EDB · 中國語文課程指引（中一至中三）2023](https://www.edb.gov.hk/attachment/tc/curriculum-development/kla/chi-edu/curriculum-documents/Junior_Sec_Chi_Lang_Curr_Guide_2023.pdf)。用于 poetry, lesson：参考理解、分析、鉴赏、阅读策略与读写结合；评价应回到学生的文本依据与表达。

17. [Digital Inquiry Group · Historical Thinking Chart](https://www.inquirygroup.org/history-lessons/historical-thinking-chart)。用于 dynasty, history：参考来源辨析、情境化、互证与细读；本平台活动是据该方法及本地模板作出的设计建议。

18. [EDB · 初中中國歷史科學與教資源](https://www.edb.gov.hk/tc/curriculum-development/kla/pshe/references-and-resources/chinese-history_ncs/Junior_Secondary_Chinese_History_Applicable_to_Non-Chinese_Speaking_Students.html)。用于 dynasty, history：参考按语言基础与教学需要选择、调适中史材料；非华语学生需另配词语和阅读支持。


## 数据字段

每个项目含 `audience`、`prior`、`method`、`duration`、`objective`、`evidence`、`limitation`、`curriculum`、`basis` 三语对象，`activities` 为四个三语步骤，`sources` 为带三语用途说明的来源数组，`reviewedAt` 为资料整理日期。所有三语对象含 `zh-CN`、`zh-Hant`、`en`，供平台按当前语言渲染。

本文件没有修改 `verification.classroomVerified`，没有添加虚构机构背书，也没有把建议课时、学习证据或预设活动记录为已经发生的事实。
