# 开发与运行

## 本地运行

```bash
npm run start
```

访问 `http://127.0.0.1:4173`。

## 检查

```bash
npm run build
npm test
```

没有网络、数据库或 API Key 依赖。演示数据可在浏览器本地存储中重置。

## 真实服务的阻塞项

- Supabase 项目 URL 与匿名密钥。
- 电子邮件认证服务配置。
- AI Provider 密钥。

这些未提供前只能使用明确标识的 Mock 实现。
