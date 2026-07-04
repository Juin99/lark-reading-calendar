# 部署教程

这份教程从零开始，带你把 `lark-reading-calendar` 部署成自己的阅读收集工作流。

## 0. 准备清单

你需要：

- GitHub 账号，用于获取代码。
- 腾讯云账号，用于 CloudBase 云函数和数据库。
- 飞书账号和一个飞书群，用于机器人通知、日历和多维表。
- iPhone 快捷指令 App，用于剪贴板一键收集。

## 1. 获取项目

```bash
git clone https://github.com/Juin99/lark-reading-calendar.git
cd lark-reading-calendar
```

安装云函数依赖：

```bash
cd functions/wechatTaskCollector
npm ci
cd ../..
```

## 2. 创建飞书群机器人

1. 打开飞书群。
2. 进入群设置，添加自定义机器人。
3. 复制 webhook。
4. 如果开启关键词安全校验，记录关键词，并在后续填入 `FEISHU_SECURITY_KEYWORD`。

机器人 webhook 会填入：

```text
FEISHU_WEBHOOK_URL
```

## 3. 创建飞书开放平台应用

1. 打开飞书开放平台。
2. 创建企业自建应用。
3. 记录：
   - `App ID`
   - `App Secret`
4. 开启权限：
   - 日历事件创建/读取相关权限。
   - 忙闲查询相关权限。
   - 多维表记录写入权限：`base:app:update`。
5. 发布或启用应用，使当前账号可授权。

后续会填入：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
```

## 4. 创建 CloudBase 环境

1. 打开腾讯云控制台。
2. 进入云开发 CloudBase。
3. 新建环境，按量计费即可。
4. 记录环境 ID。

复制配置模板：

```bash
cp cloudbaserc.example.json cloudbaserc.json
```

把 `YOUR_CLOUDBASE_ENV_ID` 替换成你的环境 ID。

## 5. 创建数据库集合

在 CloudBase 数据库中新建三个集合：

```text
wechattaskitems
wechattaskbatches
wechattaskauth
```

权限建议设为：

```text
仅云函数可读写
```

## 6. 配置云函数环境变量

编辑本地 `cloudbaserc.json`，把所有 `YOUR_...` 占位符换成自己的值。

必须配置：

```text
FEISHU_WEBHOOK_URL
INTAKE_SECRET
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_REDIRECT_URI
OAUTH_STATE_SECRET
```

推荐生成随机口令：

```bash
openssl rand -hex 24
```

多维表暂时还没复制好时，可以先留空：

```text
FEISHU_BASE_APP_TOKEN=
FEISHU_BASE_TABLE_ID=
```

## 7. 部署云函数并开启 HTTP

使用 CloudBase CLI 部署，或在腾讯云控制台上传 `functions/wechatTaskCollector`。

函数配置：

```text
函数名：wechatTaskCollector
运行环境：Node.js 20
入口：index.main
超时：20 秒
```

开启 HTTP 访问服务，得到一个 HTTPS 地址，例如：

```text
https://YOUR_ENV_ID-xxxx.ap-shanghai.app.tcloudbase.com/wechat-task
```

把这个地址写回：

```text
FEISHU_REDIRECT_URI=你的 CloudBase HTTP 地址?action=oauth_callback
```

重新部署一次，让环境变量生效。

## 8. 配置飞书 OAuth 回调

在飞书开放平台应用的安全设置里添加 OAuth 重定向 URL：

```text
你的 CloudBase HTTP 地址?action=oauth_callback
```

然后在浏览器打开：

```text
你的 CloudBase HTTP 地址?action=auth_start&secret=你的 INTAKE_SECRET
```

授权成功后，打开状态接口：

```bash
curl '你的 CloudBase HTTP 地址?action=status&secret=你的 INTAKE_SECRET'
```

预期：

```json
{
  "calendarAuth": {
    "authorized": true,
    "refreshable": true,
    "freebusyReady": true
  }
}
```

## 9. 复制飞书多维表模板

公开模板链接待补充。你也可以按 [templates/bitable/schema.md](./templates/bitable/schema.md) 手动建表。

需要从多维表 URL 中取得：

```text
FEISHU_BASE_APP_TOKEN
FEISHU_BASE_TABLE_ID
```

填入 CloudBase 环境变量后重新部署。

如果新增了多维表权限，请重新打开授权链接：

```text
你的 CloudBase HTTP 地址?action=auth_start&secret=你的 INTAKE_SECRET
```

状态接口里的 `calendarAuth.baseScopeReady` 为 `true` 时，代表多维表写入权限已包含在 OAuth token 中。

## 10. 导入快捷指令模板

快捷指令说明见 [templates/shortcuts/README.md](./templates/shortcuts/README.md)。

首次运行时填写：

- CloudBase HTTP URL
- `INTAKE_SECRET`

之后每次运行：

1. 读取剪贴板。
2. 把内容 POST 到 CloudBase。
3. 显示保存结果。

## 11. 端到端测试

手工测试一条：

```bash
curl -X POST '你的 CloudBase HTTP 地址' \
  -H 'Content-Type: application/json' \
  -d '{
    "secret": "你的 INTAKE_SECRET",
    "text": "测试一条阅读收集消息",
    "source": "manual-test",
    "channel": "test",
    "entry": "curl"
  }'
```

连续提交 5 条后，预期：

1. 前 4 条飞书群显示收集进度。
2. 第 5 条触发飞书日历事件。
3. 多维表出现 5 条记录。
4. 日历事件描述中有反馈链接。
5. 打开反馈链接提交状态后，多维表和 CloudBase 均回写。

## 12. 常见问题

更多排查见 [docs/troubleshooting.md](./docs/troubleshooting.md)。
