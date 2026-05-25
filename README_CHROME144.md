# 足球Crow*指数监控插件 - Chrome 144+ 测试版本

## 版本说明

此版本专为 **Google Chrome 144.0.7559.110** 及更高版本优化，使用完整的 Manifest V3 API，移除了旧版浏览器兼容代码。

**注意**: 实际生产环境仍建议使用兼容 Edge 84 的原始版本。

## 主要变更

### 1. Manifest 配置
- 版本号更新为 `1.1.0`
- 名称标识为 "Chrome 144+ 优化版"
- 完全使用 Manifest V3 规范

### 2. Background Script 优化
- **移除**: `chrome.tabs.executeScript` (Manifest V2 API)
- **使用**: `chrome.scripting.executeScript` with `world: "MAIN"`
- **移除**: `chrome.browserAction` 兼容代码
- **使用**: `chrome.action` API
- **改进**: 增强的错误日志和调试信息

### 3. API 使用对比

| 功能 | Edge 84 版本 | Chrome 144 版本 |
|------|-------------|-----------------|
| 脚本注入 | `chrome.tabs.executeScript` | `chrome.scripting.executeScript` |
| 徽章 API | `chrome.browserAction` | `chrome.action` |
| Service Worker | 兼容性检查 | 直接使用 |
| 错误处理 | 基础 | 增强的 console 日志 |

## 安装步骤

### 1. 加载扩展

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择 `footballPlugin2` 文件夹
5. 确认扩展已加载，图标显示在工具栏

### 2. 验证版本

- 在扩展列表中查看名称显示为: **"足球Crow*指数监控插件 (Chrome 144+)"**
- 版本号应为: **1.1.0**

### 3. 测试功能

1. 访问目标网站: https://live.titan007.com/indexall.aspx
2. 打开 Chrome 开发者工具 (F12)
3. 查看 Console 确认扩展启动日志
4. 点击扩展图标打开 Popup，配置监控参数
5. 观察赔率变化并验证抓取功能

## 调试方法

### Content Script 日志
打开目标页面的开发者工具 Console，查找 `[CrowMon]` 前缀的日志。

### Background Service Worker 日志
1. 访问 `chrome://extensions/`
2. 找到本扩展
3. 点击 **"检查视图: Service Worker"**
4. 查看后台脚本的日志输出

### Popup 日志
右键点击扩展图标 → **"检查弹出内容"** → 查看 Console

## 功能特性

### 检测模式
- **百分比模式**: 当赔率变化百分比超过阈值时触发
- **绝对值模式**: 当赔率变化绝对值超过阈值时触发

### 监控范围
- **亚洲盘** (Asian Handicap): 主队/客队赔率
- **大小球** (Over/Under): 大球/小球赔率

### 自动功能
- 自动点击"添加置顶"按钮
- 自动刷新监控数据
- 自动清理过期数据 (24小时)

## 配置参数

在 Popup 中可配置:

| 参数 | 默认值 | 说明 |
|-----|--------|------|
| 检测模式 | 百分比 | 百分比或绝对值 |
| 亚洲盘百分比阈值 | 10% | 触发抓取的百分比 |
| 大小球百分比阈值 | 10% | 触发抓取的百分比 |
| 亚洲盘绝对值阈值 | 0.10 | 触发抓取的绝对值 |
| 大球绝对值阈值 | 0.10 | 触发抓取的绝对值 |
| 小球绝对值阈值 | 0.10 | 触发抓取的绝对值 |
| 刷新间隔 | 5秒 | 3-30秒可选 |

## 已知限制

1. **仅限 Chrome 88+**: 需要 `chrome.scripting.executeScript` API 支持
2. **需要开发者模式**: 未上架 Chrome Web Store
3. **目标网站限制**: 仅适用于 `*.titan007.com` 域名

## 与 Edge 84 版本对比

### Edge 84 版本保留的兼容性代码
```javascript
// 同时支持 MV2 和 MV3 API
if (chrome.scripting && chrome.scripting.executeScript) {
  // Manifest V3
} else if (chrome.tabs && chrome.tabs.executeScript) {
  // Manifest V2 for Edge 84
}
```

### Chrome 144 版本简化代码
```javascript
// 仅使用 Manifest V3 API
chrome.scripting.executeScript({
  target: { tabId: tabId },
  func: (codeStr) => { eval(codeStr); },
  args: [code],
  world: "MAIN"
});
```

## 故障排查

### 扩展无法加载
- 确认 Chrome 版本 ≥ 88
- 检查是否开启开发者模式
- 查看扩展错误信息

### 脚本注入失败
- 查看 Service Worker 日志中的错误信息
- 确认 `chrome.scripting` API 可用
- 检查目标网站是否符合 host_permissions

### 监控无数据
- 确认目标网站 URL 正确
- 检查 Content Script 是否成功注入
- 查看页面 Console 是否有 `[CrowMon]` 日志

## 开发者信息

- **Manifest 版本**: V3
- **最低 Chrome 版本**: 88 (推荐 144+)
- **权限**: activeTab, storage, tabs, scripting
- **目标域名**: `*.titan007.com`

## 回退到 Edge 84 版本

如需回退到 Edge 84 兼容版本，恢复以下代码:

1. `background.js` 中恢复 `chrome.tabs.executeScript` 兼容分支
2. `background.js` 中恢复 `chrome.browserAction` 兼容代码
3. `manifest.json` 中版本号改回 `1.0.0`

---

**测试日期**: 2026-02-09
**目标浏览器**: Google Chrome 144.0.7559.110 (正式版本)
**生产浏览器**: Microsoft Edge 84.0.522.49 (官方内部版本)(64位)
