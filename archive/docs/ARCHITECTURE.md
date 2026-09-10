# 架构

当前版本是一个单体、无服务器依赖的本地演示实现：

```text
Hash 路由与 UI
  ↓
领域状态与表单校验
  ↓
Mock Repository / localStorage
  ↓
Mock AI Provider（可替换）
```

真实部署建议采用 Next.js App Router + TypeScript + Supabase（PostgreSQL、Auth、Storage），以 Repository 接口替换本地实现。真实凭证通过环境变量提供，不写入仓库。

## 边界

- 所有授权在真实服务端校验，前端只做体验层控制。
- 外部链接先告知用户再打开。
- AI 输出必须显示为建议，等待教师确认后才保存或发布。
