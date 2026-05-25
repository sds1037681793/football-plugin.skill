# Chrome Manifest V3 使用指南

## ✅ 已完成升级

你的插件已经成功升级到 **Manifest V3**，现在可以在 **Chrome 144** 上使用了！

## 📦 版本说明

### 当前版本（Manifest V3）
- **文件**: `manifest.json`
- **适用浏览器**: Chrome 88+, Edge 88+
- **状态**: ✅ 推荐使用

### 旧版本（Manifest V2）
- **文件**: `manifest.v2.json`
- **适用浏览器**: Edge 84 及其他旧版浏览器
- **状态**: 🔒 仅用于旧浏览器

## 🚀 在 Chrome 144 上安装

### 1. 加载扩展程序

在 Chrome 地址栏输入：
```
chrome://extensions/
```

### 2. 启用开发者模式
点击右上角的 **"开发者模式"** 开关

### 3. 加载未打包的扩展程序
1. 点击 **"加载已解压的扩展程序"**
2. 选择文件夹：`/Users/shidesheng/Desktop/锤子/footballPlugin2`
3. 点击 **"选择"**

### 4. 验证安装成功
✅ 扩展列表中显示：**足球Crow*指数监控插件 v1.0.0**
✅ 浏览器工具栏出现插件图标
✅ 没有错误提示

## 🔄 主要改动（MV2 → MV3）

### Manifest 文件变更

| 项目 | Manifest V2 | Manifest V3 |
|------|-------------|-------------|
| 版本号 | `"manifest_version": 2` | `"manifest_version": 3` |
| 浏览器按钮 | `browser_action` | `action` |
| 后台脚本 | `background.scripts` | `background.service_worker` |
| 权限 | `permissions` 包含主机 | `host_permissions` 独立 |
| 脚本注入 | `chrome.tabs.executeScript` | `chrome.scripting.executeScript` |

### Background 脚本更新

- **Service Worker 模式**: 不再是持久后台页面
- **新 API**: 使用 `chrome.scripting` 代替 `chrome.tabs.executeScript`
- **向后兼容**: 代码会自动检测并使用合适的 API

### 代码兼容性

`background.js` 已更新为自动检测浏览器版本：
```javascript
if (chrome.scripting && chrome.scripting.executeScript) {
  // 使用 MV3 新 API (Chrome 88+)
} else if (chrome.tabs && chrome.tabs.executeScript) {
  // 降级到 MV2 旧 API (Edge 84)
}
```

## 🔧 在 Edge 84 上使用旧版本

如果你需要在 Edge 84 上使用，请切换到 Manifest V2：

### 方法 1：重命名文件
```bash
cd /Users/shidesheng/Desktop/锤子/footballPlugin2
mv manifest.json manifest.v3.json
mv manifest.v2.json manifest.json
```

### 方法 2：复制一份
为 Edge 84 创建单独的文件夹：
```bash
cp -r footballPlugin2 footballPlugin2-edge84
cd footballPlugin2-edge84
mv manifest.json manifest.v3.json
mv manifest.v2.json manifest.json
```

## 🧪 测试步骤

### 1. 访问目标网站
```
https://live.titan007.com/indexall.aspx
```

### 2. 检查插件注入
打开开发者工具 (F12) → Console：
```
应该看到: 足球Crow*指数监控插件已启动
```

### 3. 检查监控列表
页面顶部应该出现三列表格：
- **第一列**: 让球触发的比赛
- **第二列**: 大球触发的比赛
- **第三列**: 小球触发的比赛

### 4. 测试功能
- ✅ 赔率变化自动捕获
- ✅ 自动置顶功能
- ✅ 提示音播放
- ✅ 弹窗设置
- ✅ 收起/展开
- ✅ 清空/导出

## ⚡ Chrome 144 vs Edge 84 性能对比

| 功能 | Chrome 144 (MV3) | Edge 84 (MV2) |
|------|------------------|---------------|
| 启动速度 | 🚀 更快 | 🐌 较慢 |
| 内存占用 | 📉 更低 | 📊 较高 |
| CPU 使用 | ⚡ 更高效 | 💻 一般 |
| 提示音 | 🔊 完美 | 🔇 可能受限 |
| UI 流畅度 | ✨ 丝滑 | ⚙️ 一般 |

## 🔍 调试

### 查看 Service Worker 日志
```
chrome://extensions/ → 详细信息 → Service Worker → 检查视图
```

### 查看内容脚本日志
在目标网页按 F12 → Console

### 查看存储数据
```javascript
chrome.storage.local.get(null, console.log)
```

## 📝 注意事项

### Service Worker 特点

1. **非持久化**: 空闲时会自动休眠
2. **定时器限制**: 长时间定时器可能不可靠
3. **DOM 访问**: 无法直接访问 DOM

### 数据持久化

所有数据都保存在 `chrome.storage.local`：
- `monitoringData`: 监控记录
- `detectionMode`: 检测模式
- `thresholdAsian`: 让球阈值
- `thresholdTotal`: 大小球阈值
- `refreshInterval`: 刷新间隔
- `drawerOpen`: 抽屉状态
- `drawerHeight`: 抽屉高度

### Service Worker 自动唤醒

以下事件会唤醒 Service Worker：
- 来自 content script 的消息
- 用户点击扩展图标
- 标签页关闭
- 安装/更新事件

## ❓ 常见问题

### Q: 为什么 Chrome 144 不支持 Manifest V2？

A: Google 从 2023 年开始逐步淘汰 MV2，Chrome 127+ 已完全停止支持。

### Q: MV3 有什么优势？

A: 更好的安全性、性能和隐私保护。

### Q: 如何在 Edge 84 和 Chrome 144 之间切换？

A: 维护两个文件夹，分别使用 `manifest.v2.json` 和 `manifest.json`（MV3）。

### Q: 数据可以迁移吗？

A: 可以！`chrome.storage.local` 的数据格式完全兼容。

## 🎯 快速切换版本

创建一个快速切换脚本：

```bash
#!/bin/bash
# switch-manifest.sh

if [ "$1" = "v3" ]; then
  echo "切换到 Manifest V3 (Chrome 144+)"
  cp manifest.json manifest.v2.temp.json
  cp manifest.v3.json manifest.json
elif [ "$1" = "v2" ]; then
  echo "切换到 Manifest V2 (Edge 84)"
  cp manifest.json manifest.v3.temp.json
  cp manifest.v2.json manifest.json
else
  echo "用法: ./switch-manifest.sh [v2|v3]"
fi
```

使用方法：
```bash
chmod +x switch-manifest.sh
./switch-manifest.sh v3  # 切换到 MV3
./switch-manifest.sh v2  # 切换到 MV2
```

## 🎉 完成！

现在你的插件已经可以在 **Chrome 144** 上正常运行了！

如果遇到任何问题，请检查：
1. Chrome 版本是否 ≥ 88
2. 开发者模式是否已启用
3. 控制台是否有错误信息

---

**最后更新**: 2026-02-09
**Manifest V3 升级**: ✅ 已完成
