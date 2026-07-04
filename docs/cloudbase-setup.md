# CloudBase 设置

## 1. 创建环境

在腾讯云控制台进入云开发 CloudBase，新建一个环境。记录环境 ID。

## 2. 创建集合

创建三个数据库集合：

```text
wechattaskitems
wechattaskbatches
wechattaskauth
```

权限选择：

```text
仅云函数可读写
```

## 3. 准备配置文件

```bash
cp cloudbaserc.example.json cloudbaserc.json
```

编辑 `cloudbaserc.json`，替换所有 `YOUR_...` 占位符。

`cloudbaserc.json` 已被 `.gitignore` 排除，不要提交到 GitHub。

## 4. 部署函数

函数目录：

```text
functions/wechatTaskCollector
```

运行环境：

```text
Node.js 20
```

入口：

```text
index.main
```

部署前安装依赖：

```bash
cd functions/wechatTaskCollector
npm ci
```

## 5. 开启 HTTP 访问

给函数开启 HTTP 访问后，会得到一个 HTTPS URL。后续快捷指令、机器人 webhook、OAuth callback 都使用这个 URL。

示例：

```text
https://YOUR_ENV_ID-xxxx.ap-shanghai.app.tcloudbase.com/wechat-task
```

把 OAuth callback 配成：

```text
https://YOUR_ENV_ID-xxxx.ap-shanghai.app.tcloudbase.com/wechat-task?action=oauth_callback
```

## 6. 环境变量最小集

最小可运行配置：

```text
FEISHU_WEBHOOK_URL
INTAKE_SECRET
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_REDIRECT_URI
OAUTH_STATE_SECRET
```

多维表同步需要额外配置：

```text
FEISHU_BASE_APP_TOKEN
FEISHU_BASE_TABLE_ID
```
