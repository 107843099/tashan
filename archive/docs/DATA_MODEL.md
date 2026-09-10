# 数据模型

所有实体在演示环境中由浏览器本地数据模拟；字段名与未来关系数据库保持一致。

## 核心实体

| 实体 | 关键字段 | 关系 |
| --- | --- | --- |
| User | id, name, email, role, teamIds | 拥有项目、复现、课堂实施 |
| Team | id, name, memberIds | 可归属多个项目 |
| Project | id, slug, title, status, sourceType, sourceProjectId, validation | 关联教学、环境、步骤、资源与版本 |
| TeachingAudience | age, grade, size, priorKnowledge, grouping | 属于项目 |
| TeacherRequirement | subject, technicalLevel, aiLevel, preparationTime | 属于项目 |
| TeachingObjective | subject, technical, project, aiLiteracy, interdisciplinary | 属于项目 |
| HardwareRequirement / SoftwareRequirement | name, model/version, required, alternative | 属于项目 |
| ProjectAsset | type, title, url, version | 属于项目；不执行任何代码 |
| ReproductionStep | order, title, description, reason, expectedResult, troubleshooting | 属于项目 |
| ReproductionAttempt / ReproductionProgress | userId, projectId, status, stepStates, issues, result | 记录非作者复现 |
| Reflection | coreUnderstanding, designReason, wantedChanges, conditionDifferences, aiValue | 属于复现 |
| AdaptationProfile / AdaptationPlan | conditions, recommendations, sourceProjectId | 用于条件适配 |
| AITaskPackage | prompt, constraints, expectedOutput, status | AI 仅为协作接口 |
| SubjectTransfer | targetSubject, qualityCheck, plan | 用于学科迁移 |
| ClassroomImplementation | classDate, actualLessons, feedback, anonymousEvidence | 不保存学生身份数据 |
| ProjectRelation / ProjectVersion | parentProjectId, childProjectId, relationType | 形成项目版本网络 |
| KnowledgeInsight / EvidenceLink | statement, confidence, sampleSize, evidenceIds | 数据不足时不输出结论 |

## 枚举

- Project.status: `draft`、`published`、`archived`
- sourceType: `original`、`adapted`、`external`
- technicalValidationStatus: `unverified`、`author_verified`、`others_reproduced`
- teachingValidationStatus: `not_used`、`author_classroom`、`multi_teacher_classroom`
- ReproductionAttempt.status: `not_started`、`in_progress`、`completed`、`abandoned`
- successLevel: `success`、`partial`、`failed`

## 隐私与安全

项目及课堂记录不应上传学生姓名、学号、联系方式、可识别正脸、可识别语音或其他敏感身份信息。资源类型、大小和外链均需在真实存储接入时于服务端再次验证；上传代码绝不自动执行。
