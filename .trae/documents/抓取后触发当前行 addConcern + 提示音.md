## 目标
- 在 https://live.titan007.com/ 页面每次完成一轮抓取/比对后，对“触发的那一行比赛”调用该行的 addConcern(比赛ID,14)（等价于点击该行“添加置顶”按钮）。
- 在成功触发置顶时播放“滴滴滴”提示音（只响一次，避免一轮多场时连续响很多次）。

## 现状梳理
- 当前逻辑在 [content.js](file:///Users/shidesheng/Desktop/锤子/footballPlugin/content.js) 里：monitorLoop → parseMatchData → detectCrowChanges → significantChanges.forEach(autoClickConcern)。
- autoClickConcern 目前用 document 级 selector 找 `a[href*="addConcern(${id}"][title="添加置顶"]` 并检查 `unTop.png`，随后 click + 注入脚本调用 addConcern。
- manifest 已包含 `https://live.titan007.com/`，但该匹配只覆盖“根路径精确 URL”，不覆盖其子路径。

## 实现方案
### 1) 以“当前行”为优先触发 addConcern
- 新增一个查找行元素的方法（例如：优先 `document.getElementById('tr1_${matchId}')`，再 fallback `tr[id$='_${matchId}']`），与 titan 页面示例结构对齐。
- 扩展 autoClickConcern 支持传入 row：
  - 优先 `row.querySelector(...)` 查找该行的 `a[href*='addConcern(${matchId},14)']` 或包含 `unTop.png` 的按钮并 click。
  - 若 row 找不到/结构变化，再退回现有 document 级查找与脚本注入兜底。

### 2) 在“抓取+比对”结束后触发（只对命中的行）
- 保持 parseMatchData 纯解析（不在解析函数里做置顶副作用，避免 popup GET_CURRENT_DATA 时意外触发）。
- 在 monitorLoop 中，对 significantChanges 循环时：
  - 为每个 change.match.id 找到对应 row
  - 调用 autoClickConcern(matchId, row)
  - 统计本轮是否至少成功触发一次置顶

### 3) 提示音策略
- 将提示音触发条件从“有 significantChanges”调整为“本轮至少成功触发一次置顶”。
- 提示音实现继续使用 Web Audio API（三声短 beep）。

### 4) URL 覆盖范围修正
- 更新 [manifest.json](file:///Users/shidesheng/Desktop/锤子/footballPlugin/manifest.json) 的 content_scripts.matches，加入 `https://live.titan007.com/*`（保留现有 indexall.aspx/oldIndexall.aspx/index.aspx 也可）。

## 验证方式
- 重新加载扩展后打开 https://live.titan007.com/（或其实际承载列表的页面）。
- 在页面 DevTools Console 观察 [CrowMon] 日志：
  - 发生触发时，能定位到 row 并执行 click/注入 addConcern。
  - 置顶图标从 unTop.png 变为置顶态（或按钮消失）。
  - 同时仅响一次“滴滴滴”。

## 风险与兜底
- 若页面结构变更导致行 id 不是 tr1_${id}，会自动 fallback 到 `tr[id$='_${id}']` 和现有 document 级 selector + 注入 addConcern 兜底。
- 若浏览器音频策略阻止自动播放，置顶仍会执行，提示音可能静音（不影响主功能）。