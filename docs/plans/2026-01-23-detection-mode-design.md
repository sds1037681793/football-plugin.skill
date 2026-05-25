# 检测模式功能设计文档

**日期**: 2026-01-23
**功能**: 添加数值差检测模式，支持百分比和数值差两种检测方式

## 需求概述

增加一个抓取数据的条件（数值差）。当波动数值差超过设置的值时，会抓取该条数据。如果同时设置百分比和数值时，以数值差优先。具体实现方式：提供一个开关让用户选择使用"数值差模式"还是"百分比模式"，一次只能启用一种。

## 设计决策

1. **模式切换方式**: 使用单选按钮在两种模式之间切换
2. **阈值设置**: 让球盘和大小盘分别设置数值差阈值
3. **数值差范围**: 0.01 到 1.0，默认值 0.10
4. **UI交互**: 根据选择的模式显示/隐藏对应的设置项
5. **向后兼容**: 默认使用百分比模式，保持现有用户体验

## 数据存储结构

### 新增 Chrome Storage 键

- `detectionMode`: String - `"percentage"` 或 `"absolute"`，表示当前检测模式
- `thresholdAsianAbsolute`: Number - 让球盘数值差阈值（0.01-1.0，默认0.10）
- `thresholdTotalAbsolute`: Number - 大小盘数值差阈值（0.01-1.0，默认0.10）

### 保留现有存储键

- `thresholdAsian`: 让球盘百分比阈值
- `thresholdTotal`: 大小盘百分比阈值

### Content.js 变量

```javascript
let detectionMode = 'percentage';       // 'percentage' | 'absolute'
let thresholdAsianPercent = 0.1;        // 百分比模式：让球盘
let thresholdTotalPercent = 0.1;        // 百分比模式：大小盘
let thresholdAsianAbsolute = 0.10;      // 数值差模式：让球盘
let thresholdTotalAbsolute = 0.10;      // 数值差模式：大小盘
```

## 核心检测逻辑

### 当前逻辑（仅百分比）

```javascript
if (pctH > thresholdAsianPercent) {
  pushAsian = true;
  // ...
}
```

### 新逻辑（支持两种模式）

```javascript
// 计算数值差和百分比
const diffH = Math.abs(cur.asian.home - prev.asian.home);
const pctH = prev.asian.home ? (diffH / prev.asian.home) * 100 : 0;

// 根据模式判断是否触发
let shouldTrigger = false;
if (detectionMode === 'percentage') {
  shouldTrigger = pctH > thresholdAsianPercent;
} else if (detectionMode === 'absolute') {
  shouldTrigger = diffH > thresholdAsianAbsolute;
}

if (shouldTrigger) {
  pushAsian = true;
  asianChangeHome = {
    old: prev.asian.home,
    new: cur.asian.home,
    change: diffH,
    percent: pctH,
  };
}
```

### 应用位置

此逻辑需要应用到4个检测点：
1. Asian Handicap Home（让球主胜）
2. Asian Handicap Away（让球客胜）
3. Total Over（大球）
4. Total Under（小球）

## UI 界面设计

### Popup.html 新增元素

```html
<div class="settings-section">
  <h3>检测模式</h3>
  <div class="mode-selector">
    <label class="radio-label">
      <input type="radio" name="detection-mode" value="percentage" id="mode-percentage" checked>
      <span>百分比模式</span>
    </label>
    <label class="radio-label">
      <input type="radio" name="detection-mode" value="absolute" id="mode-absolute">
      <span>数值差模式</span>
    </label>
  </div>
</div>

<!-- 百分比模式设置 -->
<div class="settings-section" id="percentage-settings">
  <h3>百分比阈值</h3>
  <label>
    让球盘: <input type="number" id="threshold-asian" min="0" max="200" step="0.1" value="0.1">%
  </label>
  <label>
    大小盘: <input type="number" id="threshold-total" min="0" max="200" step="0.1" value="0.1">%
  </label>
</div>

<!-- 数值差模式设置 -->
<div class="settings-section" id="absolute-settings" style="display: none;">
  <h3>数值差阈值</h3>
  <label>
    让球盘: <input type="number" id="threshold-asian-absolute" min="0.01" max="1.0" step="0.01" value="0.10">
  </label>
  <label>
    大小盘: <input type="number" id="threshold-total-absolute" min="0.01" max="1.0" step="0.01" value="0.10">
  </label>
</div>
```

### Popup.js 核心函数

**1. 加载设置并恢复状态**

```javascript
function loadSettings() {
  chrome.storage.local.get([
    'detectionMode',
    'threshold',
    'thresholdAsian',
    'thresholdTotal',
    'thresholdAsianAbsolute',
    'thresholdTotalAbsolute',
    'refreshInterval'
  ], (result) => {
    // 恢复模式选择
    const mode = result.detectionMode || 'percentage';
    document.getElementById(`mode-${mode}`).checked = true;
    toggleSettingsSections(mode);

    // 恢复百分比设置
    if (result.thresholdAsian) {
      document.getElementById('threshold-asian').value = result.thresholdAsian;
    }
    if (result.thresholdTotal) {
      document.getElementById('threshold-total').value = result.thresholdTotal;
    }

    // 恢复数值差设置
    if (result.thresholdAsianAbsolute) {
      document.getElementById('threshold-asian-absolute').value = result.thresholdAsianAbsolute;
    }
    if (result.thresholdTotalAbsolute) {
      document.getElementById('threshold-total-absolute').value = result.thresholdTotalAbsolute;
    }
  });
}
```

**2. 切换设置区域显示**

```javascript
function toggleSettingsSections(mode) {
  const percentageSettings = document.getElementById('percentage-settings');
  const absoluteSettings = document.getElementById('absolute-settings');

  if (mode === 'percentage') {
    percentageSettings.style.display = 'block';
    absoluteSettings.style.display = 'none';
  } else {
    percentageSettings.style.display = 'none';
    absoluteSettings.style.display = 'block';
  }
}
```

**3. 事件监听器**

```javascript
// 监听模式切换
document.querySelectorAll('input[name="detection-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const mode = e.target.value;
    toggleSettingsSections(mode);
    chrome.storage.local.set({ detectionMode: mode });
  });
});

// 监听数值差阈值变化
document.getElementById('threshold-asian-absolute').addEventListener('change', (e) => {
  const value = parseFloat(e.target.value);
  if (!isNaN(value) && value >= 0.01 && value <= 1.0) {
    chrome.storage.local.set({ thresholdAsianAbsolute: value });
  }
});

document.getElementById('threshold-total-absolute').addEventListener('change', (e) => {
  const value = parseFloat(e.target.value);
  if (!isNaN(value) && value >= 0.01 && value <= 1.0) {
    chrome.storage.local.set({ thresholdTotalAbsolute: value });
  }
});
```

## Content.js 配置加载

### loadSettingsAndStart() 修改

```javascript
function loadSettingsAndStart() {
  chrome.storage.local.get([
    'detectionMode',
    'threshold',
    'thresholdAsian',
    'thresholdTotal',
    'thresholdAsianAbsolute',
    'thresholdTotalAbsolute',
    'refreshInterval',
    'drawerOpen',
    'drawerHeight',
  ], (result) => {
    // 加载检测模式
    if (result.detectionMode) {
      detectionMode = result.detectionMode;
    }

    // 加载百分比阈值（现有逻辑）
    if (typeof result.threshold === 'number' && result.threshold > 0) {
      thresholdPercent = result.threshold;
    }
    if (typeof result.thresholdAsian === 'number' && result.thresholdAsian >= 0) {
      thresholdAsianPercent = result.thresholdAsian;
    } else {
      thresholdAsianPercent = thresholdPercent;
    }
    if (typeof result.thresholdTotal === 'number' && result.thresholdTotal >= 0) {
      thresholdTotalPercent = result.thresholdTotal;
    } else {
      thresholdTotalPercent = thresholdPercent;
    }

    // 加载数值差阈值（新增）
    if (typeof result.thresholdAsianAbsolute === 'number' && result.thresholdAsianAbsolute > 0) {
      thresholdAsianAbsolute = result.thresholdAsianAbsolute;
    }
    if (typeof result.thresholdTotalAbsolute === 'number' && result.thresholdTotalAbsolute > 0) {
      thresholdTotalAbsolute = result.thresholdTotalAbsolute;
    }

    // 其他现有逻辑...
    if (typeof result.refreshInterval === 'number' && result.refreshInterval > 0) {
      refreshMs = result.refreshInterval * 1000;
    }

    createOverlay();
    // ...
  });
}
```

### Storage 变化监听

```javascript
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // 监听模式变化
  if (changes.detectionMode) {
    detectionMode = changes.detectionMode.newValue;
  }

  // 监听数值差阈值变化
  if (changes.thresholdAsianAbsolute && typeof changes.thresholdAsianAbsolute.newValue === 'number') {
    thresholdAsianAbsolute = changes.thresholdAsianAbsolute.newValue;
  }
  if (changes.thresholdTotalAbsolute && typeof changes.thresholdTotalAbsolute.newValue === 'number') {
    thresholdTotalAbsolute = changes.thresholdTotalAbsolute.newValue;
  }

  // 现有的监听逻辑保持不变...
});
```

## 显示逻辑优化

根据当前模式在 UI 中显示不同的触发原因信息。

### Reason 生成逻辑

```javascript
if (pushAsian) {
  if (asianChangeHome) {
    const sign = cur.asian.home >= prev.asian.home ? "+" : "-";
    let reasonText;

    if (detectionMode === 'percentage') {
      reasonText = `让球主胜: <span style="color:${
        sign === "+" ? "#d35400" : "#27ae60"
      };font-weight:bold;">${sign}${asianChangeHome.percent.toFixed(2)}%</span>`;
    } else {
      reasonText = `让球主胜: <span style="color:${
        sign === "+" ? "#d35400" : "#27ae60"
      };font-weight:bold;">${sign}${asianChangeHome.change.toFixed(3)}</span>`;
    }

    reasonParts.push(reasonText);
  }
}
```

### 显示效果

- **百分比模式**: `让球主胜: +12.50%` 或 `大球: -8.33%`
- **数值差模式**: `让球主胜: +0.120` 或 `大球: -0.085`

## 边界情况处理

### 1. 默认值和向后兼容

- 首次安装或未设置时，`detectionMode` 默认为 `'percentage'`
- 数值差阈值未设置时，使用默认值 0.10
- 保持与现有版本的向后兼容性

### 2. 输入验证

- 数值差阈值严格限制在 0.01 到 1.0 范围内
- HTML input 元素使用 `min="0.01" max="1.0" step="0.01"` 限制输入
- JavaScript 中进行二次验证，防止非法值

### 3. 数据保留

- 切换模式不会丢失历史监控数据
- 切换模式不会清空 `matchHistory`
- 两种模式的阈值设置独立保存，互不影响

### 4. 数据结构一致性

- 无论哪种模式，`asianChangeHome` 等对象始终保存 `change` 和 `percent` 两个值
- 这样即使切换模式，数据导出时两种信息都可用

## 测试建议

### 功能测试

1. **百分比模式测试**
   - 设置让球盘阈值 10%
   - 设置大小盘阈值 10%
   - 验证触发数据抓取并正确显示百分比

2. **数值差模式测试**
   - 切换到数值差模式
   - 设置让球盘阈值 0.05
   - 设置大小盘阈值 0.05
   - 验证触发数据抓取并正确显示数值差

3. **模式切换测试**
   - 在百分比模式设置阈值并触发数据
   - 切换到数值差模式，设置不同阈值
   - 切换回百分比模式
   - 验证两边的设置值都保留

4. **边界值测试**
   - 测试数值差最小值 0.01
   - 测试数值差最大值 1.0
   - 验证边界值能正常触发检测

5. **UI 一致性测试**
   - 验证 overlay drawer 显示正确的触发原因
   - 验证 popup 显示正确的触发原因
   - 验证导出的 JSON 数据包含完整信息

### 集成测试

1. 在目标网站打开多个比赛
2. 切换不同模式观察抓取行为差异
3. 验证 auto-pin 功能在两种模式下都正常工作
4. 验证刷新间隔和其他设置不受影响

## 实施文件清单

需要修改的文件：

1. **content.js** - 核心检测逻辑、配置加载、显示逻辑
2. **popup.html** - UI 结构添加模式选择和数值差输入
3. **popup.js** - 事件处理、配置保存加载、UI 切换
4. **popup.css** (可选) - 样式调整以适配新 UI 元素
5. **CLAUDE.md** - 更新文档说明新功能

## 预期效果

- 用户可以根据自己的需求选择使用百分比或数值差进行监控
- 数值差模式适合关注绝对变化幅度的场景
- 百分比模式适合关注相对变化比例的场景
- 两种模式独立配置，互不干扰
- UI 简洁清晰，不会混淆当前生效的设置
