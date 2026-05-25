// 弹出窗口脚本
document.addEventListener("DOMContentLoaded", function () {
  // DOM元素
  const statusIndicator = document.getElementById("status-indicator");
  const statusText = document.getElementById("status-text");
  const activeCount = document.getElementById("active-count");
  const totalChanges = document.getElementById("total-changes");
  // const matchesList = document.getElementById("matches-list");
  const refreshBtn = document.getElementById("refresh-btn");
  const clearBtn = document.getElementById("clear-btn");
  const exportBtn = document.getElementById("export-btn");
  const thresholdInput = document.getElementById("threshold-input");
  const refreshInterval = document.getElementById("refresh-interval");
  const thresholdAsianInput = document.getElementById("threshold-asian");
  const thresholdTotalInput = document.getElementById("threshold-total");
  const thresholdAsianAbsoluteInput = document.getElementById(
    "threshold-asian-absolute",
  );
  const thresholdOverAbsoluteInput = document.getElementById(
    "threshold-over-absolute",
  );
  const thresholdUnderAbsoluteInput = document.getElementById(
    "threshold-under-absolute",
  );
  const modePercentageRadio = document.getElementById("mode-percentage");
  const modeAbsoluteRadio = document.getElementById("mode-absolute");
  const percentageSettings = document.getElementById("percentage-settings");
  const absoluteSettings = document.getElementById("absolute-settings");

  let monitoringData = [];
  let isMonitoring = false;
  let refreshTimer = null;

  // 初始化
  function init() {
    loadData();
    setupEventListeners();
    startAutoRefresh();
  }

  // 加载数据
  function loadData() {
    chrome.runtime.sendMessage({ type: "GET_MONITORING_DATA" }, (response) => {
      if (response) {
        monitoringData = response.data || [];
        isMonitoring = response.isMonitoring || false;
        updateUI();
      }
    });
  }

  // 设置事件监听器
  function setupEventListeners() {
    refreshBtn.addEventListener("click", handleRefresh);
    clearBtn.addEventListener("click", handleClear);
    exportBtn.addEventListener("click", handleExport);
    if (thresholdInput) {
      thresholdInput.addEventListener("change", handleThresholdChange);
    }
    thresholdAsianInput.addEventListener("change", handleThresholdAsianChange);
    thresholdTotalInput.addEventListener("change", handleThresholdTotalChange);
    thresholdAsianAbsoluteInput.addEventListener(
      "change",
      handleThresholdAsianAbsoluteChange,
    );
    thresholdOverAbsoluteInput.addEventListener(
      "change",
      handleThresholdOverAbsoluteChange,
    );
    thresholdUnderAbsoluteInput.addEventListener(
      "change",
      handleThresholdUnderAbsoluteChange,
    );
    refreshInterval.addEventListener("change", handleRefreshIntervalChange);

    // 监听模式切换
    modePercentageRadio.addEventListener("change", handleModeChange);
    modeAbsoluteRadio.addEventListener("change", handleModeChange);
  }

  // 处理刷新
  function handleRefresh() {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<span class="icon">⏳</span> 刷新中';

    loadData();

    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = '<span class="icon">🔄</span> 刷新';
    }, 1000);
  }

  // 处理清空
  function handleClear() {
    if (confirm("确定要清空所有监控数据吗？")) {
      chrome.runtime.sendMessage({ type: "CLEAR_DATA" }, (response) => {
        if (response.success) {
          monitoringData = [];
          updateUI();
        }
      });
    }
  }

  // 处理导出
  function handleExport() {
    if (monitoringData.length === 0) {
      alert("没有数据可导出");
      return;
    }

    const exportData = {
      exportTime: new Date().toISOString(),
      totalMatches: monitoringData.length,
      matches: monitoringData.map((item) => ({
        matchId: item.id,
        teams: `${item.match.homeTeam} vs ${item.match.awayTeam}`,
        score: `${item.match.homeScore}-${item.match.awayScore}`,
        time: item.match.time,
        status: item.match.status,
        crowIndexChanges: item.changes,
        firstDetected: new Date(item.firstDetected).toLocaleString(),
        lastUpdated: new Date(item.lastUpdated).toLocaleString(),
      })),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `crow-index-changes-${new Date().toISOString().split("T")[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  // 处理阈值变化
  function handleThresholdChange() {
    const threshold = parseFloat(thresholdInput.value);
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 200) {
      chrome.storage.local.set({ threshold });
    }
  }
  function handleThresholdAsianChange() {
    const threshold = parseFloat(thresholdAsianInput.value);
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 200) {
      chrome.storage.local.set({ thresholdAsian: threshold });
    }
  }
  function handleThresholdTotalChange() {
    const threshold = parseFloat(thresholdTotalInput.value);
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 200) {
      chrome.storage.local.set({ thresholdTotal: threshold });
    }
  }
  function handleThresholdAsianAbsoluteChange() {
    const threshold = parseFloat(thresholdAsianAbsoluteInput.value);
    if (!isNaN(threshold) && threshold >= 0.01 && threshold <= 1.0) {
      chrome.storage.local.set({ thresholdAsianAbsolute: threshold });
    }
  }
  function handleThresholdOverAbsoluteChange() {
    const threshold = parseFloat(thresholdOverAbsoluteInput.value);
    if (!isNaN(threshold) && threshold >= 0.01 && threshold <= 1.0) {
      chrome.storage.local.set({ thresholdOverAbsolute: threshold });
    }
  }
  function handleThresholdUnderAbsoluteChange() {
    const threshold = parseFloat(thresholdUnderAbsoluteInput.value);
    if (!isNaN(threshold) && threshold >= 0.01 && threshold <= 1.0) {
      chrome.storage.local.set({ thresholdUnderAbsolute: threshold });
    }
  }

  // 处理刷新间隔变化
  function handleRefreshIntervalChange() {
    const interval = parseInt(refreshInterval.value);
    chrome.storage.local.set({ refreshInterval: interval });
    startAutoRefresh();
  }

  // 处理模式切换
  function handleModeChange(e) {
    const mode = e.target.value;
    toggleSettingsSections(mode);
    chrome.storage.local.set({ detectionMode: mode });
  }

  // 切换设置区域显示
  function toggleSettingsSections(mode) {
    if (mode === "percentage") {
      percentageSettings.style.display = "block";
      absoluteSettings.style.display = "none";
    } else if (mode === "absolute") {
      percentageSettings.style.display = "none";
      absoluteSettings.style.display = "block";
    }
  }

  // 开始自动刷新
  function startAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    const interval = parseInt(refreshInterval.value) * 1000;
    refreshTimer = setInterval(loadData, interval);
  }

  // 更新UI
  function updateUI() {
    updateStatus();
    updateStats();
    // updateMatchesList();
  }

  // 更新状态
  function updateStatus() {
    if (isMonitoring) {
      statusIndicator.classList.add("active");
      statusText.textContent = `监控中 - ${monitoringData.length}场比赛`;
    } else {
      statusIndicator.classList.remove("active");
      statusText.textContent = "等待数据...";
    }
  }

  // 更新统计
  function updateStats() {
    // 检查元素是否存在（可能在 HTML 中被注释掉）
    if (activeCount) {
      activeCount.textContent = monitoringData.length;
    }

    // 计算总变化数
    const totalChangesElement = document.getElementById("total-changes");
    if (totalChangesElement) {
      const totalChanges = monitoringData.reduce((sum, item) => {
        return sum + Object.keys(item.changes).length;
      }, 0);
      totalChangesElement.textContent = totalChanges;
    }
  }

  // 更新比赛列表
  function updateMatchesList() {
    if (monitoringData.length === 0) {
      matchesList.innerHTML = `
        <div class="empty-state" style="text-align:center">
          <p>暂无监控数据</p>
          <small>当Crow*指数变化超过${thresholdInput.value}%时，比赛将自动显示在这里</small>
        </div>
      `;
      return;
    }

    const sorted = [...monitoringData].sort(
      (a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0),
    );
    const rowsHTML = sorted
      .map((item, index) => {
        const m = item.match;
        const c = item.changes || {};
        const thMin = Math.min(
          parseFloat(thresholdAsianInput.value || "0") || 0,
          parseFloat(thresholdTotalInput.value || "0") || 0,
        );
        const fmtCell = (change) => {
          if (!change) return "-";
          const colored = change.percent > thMin;
          const color = colored ? "#d35400" : "#2c3e50";
          return `<span style="color:${color};font-weight:${colored ? "600" : "500"};">${change.old.toFixed(2)}→${change.new.toFixed(2)} <span style="font-size:10px;">(${change.percent.toFixed(1)}%)</span></span>`;
        };
        const home = fmtCell(c.home);
        const away = fmtCell(c.away);
        const reason = item.reason || "-";
        // 简化原因显示，太长时截断
        const shortReason =
          reason.length > 10 ? reason.substring(0, 10) + "..." : reason;

        return `
        <tr>
          <td><span class="index-tag">${index + 1}</span></td>
          <td>${m.time || "-"}</td>
          <td style="text-align:right;max-width:80px;overflow:hidden;text-overflow:ellipsis;" title="${m.homeTeam}">${m.homeTeam || "-"}</td>
          <td style="text-align:center;color:#e74c3c;font-weight:600;">${m.homeScore}-${m.awayScore}</td>
          <td style="text-align:left;max-width:80px;overflow:hidden;text-overflow:ellipsis;" title="${m.awayTeam}">${m.awayTeam || "-"}</td>
          <td>${home}</td>
          <td>${away}</td>
          <td title="${reason}">${shortReason}</td>
          <td>${formatTime(item.lastUpdated)}</td>
        </tr>`;
      })
      .join("");

    matchesList.innerHTML = `
      <table class="table-compact">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th>时间</th>
            <th style="text-align:right;">主队</th>
            <th style="text-align:center;">比分</th>
            <th style="text-align:left;">客队</th>
            <th>让球/大小(主/大)</th>
            <th>让球/大小(客/小)</th>
            <th>原因</th>
            <th>更新</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    `;
  }

  // 渲染Crow*指数变化
  function renderCrowChange(label, changeData) {
    if (!changeData) return "";

    const isPositive = changeData.percent > 0;
    const changeClass = isPositive ? "" : "negative";

    return `
      <div class="crow-change ${changeClass}">
        <div class="crow-label">${label}</div>
        <div class="crow-values">
          <span class="crow-old">${changeData.old.toFixed(2)}</span>
          <span class="crow-new">${changeData.new.toFixed(2)}</span>
          <span class="crow-percent">${changeData.percent.toFixed(1)}%</span>
        </div>
      </div>
    `;
  }

  // 格式化时间
  function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) {
      return "刚刚";
    } else if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    } else {
      return new Date(timestamp).toLocaleTimeString();
    }
  }

  // 加载设置
  function loadSettings() {
    chrome.storage.local.get(
      [
        "detectionMode",
        "threshold",
        "thresholdAsian",
        "thresholdTotal",
        "thresholdAsianAbsolute",
        "thresholdOverAbsolute",
        "thresholdUnderAbsolute",
        "refreshInterval",
      ],
      (result) => {
        // 恢复模式选择
        const mode = result.detectionMode || "percentage";
        if (mode === "percentage") {
          modePercentageRadio.checked = true;
        } else {
          modeAbsoluteRadio.checked = true;
        }
        toggleSettingsSections(mode);

        // 恢复百分比设置
        if (thresholdInput && result.threshold) {
          thresholdInput.value = result.threshold;
        }
        if (result.thresholdAsian) {
          thresholdAsianInput.value = result.thresholdAsian;
        }
        if (result.thresholdTotal) {
          thresholdTotalInput.value = result.thresholdTotal;
        }

        // 恢复数值差设置
        if (result.thresholdAsianAbsolute) {
          thresholdAsianAbsoluteInput.value = result.thresholdAsianAbsolute;
        }
        if (result.thresholdOverAbsolute) {
          thresholdOverAbsoluteInput.value = result.thresholdOverAbsolute;
        }
        if (result.thresholdUnderAbsolute) {
          thresholdUnderAbsoluteInput.value = result.thresholdUnderAbsolute;
        }

        // 恢复刷新间隔
        if (result.refreshInterval) {
          refreshInterval.value = result.refreshInterval;
        }
      },
    );
  }

  // 启动
  init();
  loadSettings();
});
