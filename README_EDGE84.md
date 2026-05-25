# Edge 84 (Chromium 84) 兼容性说明

该插件已针对 Microsoft Edge 84 (基于 Chromium 84) 进行优化。

## 安装说明

1. 打开 Edge 浏览器，进入扩展管理页面 `edge://extensions/`。
2. 开启左下角的"开发人员模式"。
3. 点击"加载解压缩的扩展"。
4. 选择本插件所在的文件夹。

## 关键配置

- **Manifest 版本**: 插件默认使用 `manifest.json` (Manifest V2)，这是 Chromium 84 支持的标准版本。请勿使用 `manifest.mv3.json`。
- **权限**: 插件申请了 `activeTab`, `storage`, `tabs` 以及 `titan007.com` 的主机权限，确保在 Edge 84 上能正常注入脚本。
- **图标**: 已在 manifest 中补全了图标配置。

## 功能支持

- **数据监控**: 使用兼容的 DOM 操作和 API，支持 Edge 84。
- **自动置顶**: 使用 Manifest V2 兼容的脚本注入方式 (`chrome.tabs.executeScript` + `script` 标签注入) 来实现在主页面上下文中执行代码。
- **导出功能**: 支持导出监控数据为 JSON 文件。

## 注意事项

- 如果遇到 `chrome.scripting` 相关的错误，请忽略。插件内部会自动检测并切换到兼容模式 (使用 `chrome.tabs`)。
- 建议定期清理监控数据以保持最佳性能。
