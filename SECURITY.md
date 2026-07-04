# 安全说明

这个项目会连接 CloudBase、飞书机器人、飞书开放平台、多维表和快捷指令。部署前请先理解：仓库里的代码和模板可以公开，但你的个人凭据不能公开。

## 不要提交这些内容

- `cloudbaserc.json`
- `.env`
- 真实飞书机器人 webhook
- `FEISHU_APP_SECRET`
- `INTAKE_SECRET`
- `OAUTH_STATE_SECRET`
- CloudBase 环境 ID
- 飞书多维表 app token / table id
- 已填好个人 URL 或 secret 的 `.shortcut` 文件
- 任何个人域名证书、截图、真实测试数据

## 如果误提交了密钥

不要只删除文件后继续使用旧密钥。请立即：

1. 在飞书开放平台重置 App Secret。
2. 重建飞书机器人 webhook，或更换安全设置。
3. 更换 `INTAKE_SECRET` 和 `OAUTH_STATE_SECRET`。
4. 检查 CloudBase 环境变量。
5. 使用 Git 历史清理工具清理仓库历史，再重新 push。

## 发布前检查

发布前至少运行：

```bash
rg -n "open-apis|bot/v2/hook|app_secret|APP_SECRET|token|TOKEN|secret|SECRET|envId|d318|132827|wechat-task-d4" .
git status --ignored
git ls-files
```

确认输出里没有真实密钥、真实 webhook 或个人实例地址。
