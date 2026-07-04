# Lark Reading Calendar 配置教程

这份文档建议放在飞书多维表模板里，作为用户复制模板后的内置教程。

## 这个模板做什么

`Lark Reading Calendar` 可以把微信剪贴板、微信机器人或其他自动化入口收集到的待读内容，保存到 CloudBase，并同步到飞书多维表。每收集够 5 条，会自动创建一个飞书日历阅读 block。

## 你需要准备

- 腾讯云 CloudBase 环境。
- 飞书群机器人。
- 飞书开放平台应用。
- 这个多维表模板的副本。
- iPhone 快捷指令模板。

## 第一步：复制多维表

复制本模板后，保留字段名不变。云函数会按字段名写入数据。

不要删除这些字段：

```text
内容, 标题, 链接, 平台, 来源, 通道, 入口, 发送人, 消息ID,
CloudBaseItemId, 状态, 收集时间, 批次ID, 日历开始, 日历结束,
日历链接, 反馈时间, 阅读反馈, 备注
```

## 第二步：获取多维表参数

你需要把多维表的 app token 和 table id 填到 CloudBase 环境变量：

```text
FEISHU_BASE_APP_TOKEN
FEISHU_BASE_TABLE_ID
```

## 第三步：配置飞书开放平台权限

飞书应用需要日历和多维表写入权限。

配置完成后，打开 CloudBase 授权链接：

```text
YOUR_CLOUDBASE_HTTP_URL?action=auth_start&secret=YOUR_INTAKE_SECRET
```

## 第四步：配置快捷指令

导入快捷指令模板后，首次运行会要求填写：

```text
CloudBase HTTP URL
INTAKE_SECRET
```

填完后复制一段微信内容，运行快捷指令即可提交。

## 第五步：测试 5 条

连续提交 5 条测试内容。

预期：

1. 飞书群收到收集进度。
2. 第 5 条后出现飞书日历事件。
3. 多维表新增 5 条记录。
4. 日历描述里有反馈链接。
5. 提交反馈后，多维表状态更新。

## 常见问题

### 多维表没有记录

检查：

- `FEISHU_BASE_APP_TOKEN`
- `FEISHU_BASE_TABLE_ID`
- 飞书应用是否有 `base:app:update`
- 是否重新 OAuth 授权

### 日历没有事件

检查：

- 是否凑够 5 条。
- 飞书日历权限是否开启。
- `auth_start` 是否授权成功。

### 快捷指令失败

检查：

- CloudBase URL 是否完整。
- `INTAKE_SECRET` 是否和云函数环境变量一致。
- 剪贴板是否为空。
