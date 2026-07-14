# 禅道周报助手 ZenTao-Weekly-Report-Assistant

禅道周报生成助手 如果有帮到您节省时间，请吝留下你的小星星Start。

Chrome 插件：从禅道「我的动态 / 日程 / 任务 / 待办」一键生成日报/周报，支持分块复制到企业微信。

## 安装（开发者模式）

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目文件夹（包含 `manifest.json` 的目录）

## 首次配置禅道地址

源码中**不包含**任何公司内网地址，默认占位为：

```
https://your-zentao-domain.com
```

### 方式 A：插件内配置（推荐）

1. 打开插件 Popup → 右上角 **⚙**
2. 填写公司禅道地址，例如 `https://www.zentao.net`
3. 点击 **保存并授权**，在浏览器弹窗中允许访问该地址
4. 在 Chrome 中打开禅道并完成登录

### 方式 B：打包前改默认值

编辑 `lib/config.js` 中的 `DEFAULT_BASE_URL`，改成你们公司地址后再发给同事：

```javascript
export const DEFAULT_BASE_URL = "https://your-company-zentao.com";
```

> 使用方式 B 时，同事首次打开仍需点击「保存并授权」以授予浏览器访问权限。

## 使用方法

1. 保持禅道页面在浏览器中打开并已登录
2. 打开插件 → **生成今日日报** 或 **生成本周周报**
3. 分别 **复制**「工作总结」「工作计划」到企业微信对应输入框
4. 或使用 **导出 TXT** / **复制全部**

## 数据来源

| 禅道页面      | 接口         | 用途             |
| ------------- | ------------ | ---------------- |
| 我的 → 动态   | `my-dynamic` | 操作记录（主要） |
| 我的 → 日程   | `my-effort`  | 工时记录         |
| 我的 → 待处理 | `my-work`    | 任务             |
| 我的 → 待办   | `my-todo`    | 计划             |

## 发布源码说明

- 仓库内**不应提交**公司内网 IP / 域名
- `manifest.json` 使用 `optional_host_permissions`，无需为每个部署环境修改 manifest
- 用户保存禅道地址时，浏览器会动态请求该域名的访问权限

## 常见问题

**请先在设置中填写禅道地址**  
说明还在使用默认占位地址，请按上文完成配置。

**提示未登录**  
先在同一浏览器登录禅道，并刷新禅道标签页。

**无法连接服务器**  
点击 ⚙ → 诊断连接；检查 VPN/内网、HTTPS 证书是否已信任。

## 项目结构

```
workReport/
├── manifest.json
├── background/service-worker.js
├── lib/
│   ├── config.js          # DEFAULT_BASE_URL 配置入口
│   ├── zentao-client.js
│   ├── report-builder.js
│   └── ...
└── popup/
```
