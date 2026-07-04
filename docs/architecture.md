# 架构说明

`lark-reading-calendar` 的核心是一个 CloudBase 云函数，它把多个入口提交的内容统一成阅读队列，再把队列同步到飞书生态。

## 数据流

```text
入口层
  iPhone 快捷指令
  OpenClaw / 微信机器人
  手工 curl / 其他自动化

        |
        v

CloudBase HTTP 云函数
  解析文本
  鉴权
  去重
  入队
  凑批

        |
        +--> CloudBase 数据库
        +--> 飞书群机器人
        +--> 飞书日历 API
        +--> 飞书多维表 API
        +--> HTML 反馈页
```

## 数据库集合

默认使用三个集合：

| 集合 | 用途 |
| --- | --- |
| `wechattaskitems` | 单条阅读内容 |
| `wechattaskbatches` | 每 5 条形成的阅读批次 |
| `wechattaskauth` | 飞书 OAuth token、open_id 和授权状态 |

集合名可以通过环境变量覆盖。

## 核心接口

所有接口复用同一个 CloudBase HTTP 地址，通过 `action` 区分。

| action | 方法 | 用途 |
| --- | --- | --- |
| 空 | POST | 收集一条内容 |
| `auth_start` | GET | 开始飞书 OAuth 授权 |
| `oauth_callback` | GET | 飞书 OAuth 回调 |
| `status` | GET | 查看队列、授权和批次状态 |
| `metadata_preview` | GET/POST | 预览链接标题识别结果，不入队 |
| `feedback` | GET | 打开阅读反馈页 |
| `feedback_submit` | POST | 提交阅读反馈 |
| `base_resync` | GET/POST | 尝试重同步多维表记录 |

## 为什么用 CloudBase 而不是本机 CLI

本机 CLI 适合个人电脑上的脚本和 agent。CloudBase 更适合这个项目，因为它可以被手机、浏览器、微信机器人同时调用，不依赖某台电脑一直在线。

飞书日历和多维表通过飞书开放 API 调用，所需密钥放在 CloudBase 环境变量里，不写入仓库。
