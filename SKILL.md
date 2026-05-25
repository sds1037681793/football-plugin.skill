---
name: football-plugin
description: Chrome/Edge 扩展插件开发助手，专用于 footballPlugin2 项目——titan007.com 足球赔率实时监控插件。当用户需要修改、调试、优化该插件时使用。涵盖：内容脚本 DOM 解析、赔率变化检测、Overlay UI、background service worker、popup 设置面板、漏抓排查、性能优化。项目路径：/Users/shidesheng/Desktop/锤子/footballPlugin2
---

# Football Plugin 开发指南

项目路径：`/Users/shidesheng/Desktop/锤子/footballPlugin2`
目标页面：`https://live.titan007.com/indexall.aspx` 和 `oldIndexall.aspx`

## 文件职责

| 文件 | 职责 |
|------|------|
| `content.js` | 注入目标页面，解析 DOM 赔率，检测变化，渲染 Overlay（1678 行） |
| `background.js` | Service Worker，持久化 `monitoringData`，处理消息（228 行） |
| `popup.js/html/css` | 扩展弹窗，设置阈值/模式，查看统计 |
| `manifest.json` | MV3，权限：`activeTab storage tabs scripting` |

## 核心数据流

```
content.js parseMatchData()           每 5s 轮询 + MutationObserver 触发
  → detectCrowChanges()               比较 currentMatches vs matchHistory
  → chrome.runtime.sendMessage(CROW_INDEX_CHANGE)
    → background.js 追加 monitoringData[]
      → chrome.storage.local.set()
        → content.js onChanged → renderOverlay()
```

## 赔率解析（parseOddsDetail）

详见 `references/dom-structure.md`。核心规则：

```
行选择器：  #tr1_{matchId}
亚盘格：    #pk_{matchId}.oddss  goal="-0.5,homeOdds,awayOdds,ts,totalLine"
左格(主/大)：pk 的前一个 td.oddss
右格(客/小)：pk 的后一个 td.oddss

Format A（常见）：左/右格各有 .odds1（亚盘）+ .odds2（大小球）
Format B（少数）：左/右格各有两个 .odds4（[0]=亚盘, [1]=大小球）

亚盘线 = pk.goal.split(',')[0]      → "-0.5"
总分线 = pk.querySelector('.odds2') → "2.5"
```

## 变化检测（detectCrowChanges）

```js
getAbsChange(old, new)  // 涨跌均触发，返回 {change, percent}
// 触发条件：line 不变 AND |delta| > threshold
// 模式：percentage（百分比）或 absolute（绝对值）
// 结束比赛："完"/"FT"/时间>100 → 从 matchHistory + monitoringData 删除
```

## 性能关键点

```js
loopRunning = true/false  // 并发锁，防止 monitorLoop 重叠
mutationTimer             // MutationObserver 300ms 防抖
mo.observe('#table_live') // 只监听赔率表，不监听整个 body
```

## 消息类型（content ↔ background）

| 消息 | 方向 | 说明 |
|------|------|------|
| `CROW_INDEX_CHANGE` | C→B | 推送捕获 |
| `GET_MONITORING_DATA` | popup→B | 拉取数据 |
| `CLEAR_DATA` | popup→B | 清空 |
| `REMOVE_FINISHED_MATCHES` | C→B | 清除已结束 |
| `INVOKE_ADD_CONCERN` | C→B | 置顶比赛 |

## chrome.storage.local 键名

| 键 | 默认值 |
|----|--------|
| `detectionMode` | `"percentage"` |
| `thresholdAsian` | 0.1 |
| `thresholdTotal` | 0.1 |
| `thresholdAsianAbsolute` | 0.10 |
| `thresholdOverAbsolute` | 0.10 |
| `thresholdUnderAbsolute` | 0.10 |
| `refreshInterval` | 5（秒）|
| `monitoringData` | [] |

## 常见任务入口

**漏抓排查**：检查 `parseOddsDetail` 返回 null 的原因（preTd/postTd 格式）；确认 `getAbsChange` 未返回 null；检查 MutationObserver 是否挂载到 `#table_live`

**新增检测字段**：在 `parseOddsDetail` 加字段 → `detectCrowChanges` 加对比逻辑 → Overlay `generateRow` 加显示

**修改阈值逻辑**：`content.js` 顶部变量 + `popup.js` 设置面板 + `storage` 键名保持一致

**重载插件**：改完代码后 → `chrome://extensions/` 或 `edge://extensions/` 点刷新图标

## 详细参考

- DOM 结构与赔率格式：`references/dom-structure.md`
- Overlay 渲染逻辑：`references/overlay-ui.md`
