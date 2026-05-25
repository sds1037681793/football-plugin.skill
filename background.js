// 后台脚本：处理数据存储和消息传递
let monitoringData = [];
let isMonitoring = false;

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("后台脚本收到消息:", request.type);

  switch (request.type) {
    case "CROW_INDEX_CHANGE":
      handleCrowIndexChange(request.data, sender.tab);
      break;

    case "GET_MONITORING_DATA":
      sendResponse({ data: monitoringData, isMonitoring: isMonitoring });
      break;

    case "INVOKE_ADD_CONCERN":
      invokeAddConcernInMainWorld(request, sender)
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      break;

    case "CLEAR_DATA":
      monitoringData = [];
      sendResponse({ success: true });
      break;

    case "START_MONITORING":
      isMonitoring = true;
      sendResponse({ success: true });
      break;

    case "STOP_MONITORING":
      isMonitoring = false;
      sendResponse({ success: true });
      break;

    case "REMOVE_FINISHED_MATCHES":
      if (
        request.matchIds &&
        Array.isArray(request.matchIds) &&
        request.matchIds.length > 0
      ) {
        const initialLength = monitoringData.length;
        monitoringData = monitoringData.filter(
          (item) => !request.matchIds.includes(item.matchId),
        );
        if (monitoringData.length !== initialLength) {
          chrome.storage.local.set({ monitoringData: monitoringData });
          updateBadge();
        }
      }
      sendResponse({ success: true });
      break;
  }

  return true; // 保持消息通道开放
});

// Chrome 144+ 版本：使用现代 Manifest V3 API
async function invokeAddConcernInMainWorld(request, sender) {
  const tabId = sender && sender.tab ? sender.tab.id : null;
  const frameId = typeof sender.frameId === "number" ? sender.frameId : 0;
  const matchId = request ? Number(request.matchId) : NaN;
  const href = request && typeof request.href === "string" ? request.href : "";
  if (!tabId || !matchId) return { ok: false, error: "bad_args" };

  const mid = matchId;
  const hrefStr = href || "";
  const jsHref = hrefStr.replace(/^javascript:/, "").trim();
  const codeParts = [];
  codeParts.push("(function(){");
  codeParts.push("try{");
  codeParts.push("var mid=" + String(mid) + ";");
  codeParts.push("var hrefStr=" + JSON.stringify(jsHref) + ";");
  codeParts.push("var sx=window.scrollX,sy=window.scrollY;");
  codeParts.push(
    "var restore=function(){try{requestAnimationFrame(function(){try{window.scrollTo(sx,sy);}catch(e){};requestAnimationFrame(function(){try{window.scrollTo(sx,sy);}catch(e){};});});}catch(e){}};",
  );
  codeParts.push(
    "var code=[];code.push('try{');code.push('var fn=window.addConcern||(window.top&&window.top.addConcern);');",
  );
  codeParts.push(
    "code.push('if(typeof fn===\\'function\\'){fn('+mid+',14);}else if(typeof addConcern===\\'function\\'){addConcern('+mid+',14);}');",
  );
  codeParts.push("if(hrefStr){code.push(hrefStr);}code.push('}catch(e){}');");
  codeParts.push(
    "var s=document.createElement('script');s.textContent=code.join('');(document.head||document.documentElement).appendChild(s);s.remove();",
  );
  codeParts.push(
    "var sel1='a[title=\"添加置顶\"][href*=\"addConcern(' + mid + ',14\"]';var sel2='a[href*=\"addConcern(' + mid + ',14\"]';var a=document.querySelector(sel1)||document.querySelector(sel2);if(a){try{a.click();}catch(e){}}",
  );
  codeParts.push("restore();");
  codeParts.push("}catch(e){}");
  codeParts.push("})();");
  const code = codeParts.join("");

  return await new Promise((resolve) => {
    try {
      // Chrome 144+ 仅使用 Manifest V3 API
      const target = { tabId: tabId };
      if (typeof frameId === "number" && frameId >= 0) {
        target.frameIds = [frameId];
      } else {
        target.allFrames = false;
      }

      chrome.scripting.executeScript(
        {
          target: target,
          func: (codeStr) => {
            eval(codeStr);
          },
          args: [code],
          world: "MAIN",
        },
        (results) => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.error("执行脚本失败:", err);
            resolve({ ok: false, error: String(err.message || err) });
          } else {
            console.log("脚本执行成功", results);
            resolve({ ok: true, via: "scripting.executeScript" });
          }
        }
      );
    } catch (e) {
      console.error("调用失败:", e);
      resolve({ ok: false, error: String(e) });
    }
  });
}

// 处理Crow*指数变化
function handleCrowIndexChange(changes, tab) {
  console.log("处理Crow*指数变化:", changes);

  changes.forEach((change) => {
    // 不再覆盖，而是追加新记录，为每条记录生成唯一ID
    const monitoringItem = {
      id: `${change.match.id}_${Date.now()}`, // 唯一ID：matchId + 时间戳
      matchId: change.match.id, // 保留原始matchId用于分组
      match: change.match,
      previous: change.previous,
      changes: change.changes,
      details: change.details,
      reason: change.reason,
      capturedAt: Date.now(),
      tabId: tab && tab.id,
      tabTitle: tab && tab.title,
      // 计算这是该场次的第几次抓取
      captureCount:
        monitoringData.filter((item) => item.matchId === change.match.id)
          .length + 1,
    };

    // 直接追加，不再覆盖
    monitoringData.push(monitoringItem);
  });

  // 保存到本地存储
  chrome.storage.local.set({ monitoringData: monitoringData });

  // 更新徽章
  updateBadge();
}

// 更新扩展图标徽章 (Chrome 144+ 使用 chrome.action)
function updateBadge() {
  const activeCount = monitoringData.length;

  if (activeCount > 0) {
    chrome.action.setBadgeText({ text: activeCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

// 清理过期数据
function cleanupExpiredData() {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24小时
  const beforeCount = monitoringData.length;

  monitoringData = monitoringData.filter((item) => {
    // 修复: 使用 capturedAt 字段而不是 lastUpdated
    const timestamp = item.capturedAt || item.lastUpdated || 0;
    return timestamp > 0 && (now - timestamp < maxAge);
  });

  const afterCount = monitoringData.length;
  const removed = beforeCount - afterCount;

  if (removed > 0) {
    console.log(`[Background] 清理过期数据: 删除 ${removed} 条记录, 剩余 ${afterCount} 条`);
  }

  chrome.storage.local.set({ monitoringData: monitoringData });
  updateBadge();
}

// 定期清理数据
setInterval(cleanupExpiredData, 60 * 60 * 1000); // 每小时清理一次

// 初始化：每次 Service Worker 启动时都加载数据
chrome.storage.local.get(["monitoringData"], (result) => {
  if (result.monitoringData) {
    monitoringData = result.monitoringData;
    updateBadge();
    console.log("后台脚本已从存储恢复数据，记录数:", monitoringData.length);
  }
});

// 监听安装事件（保留作为补充，虽然上面的代码也会在安装后执行）
chrome.runtime.onInstalled.addListener(() => {
  console.log("足球Crow*指数监控插件已安装/更新");
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener((tabId) => {
  // 清理该标签页相关的数据
  monitoringData = monitoringData.filter((item) => item.tabId !== tabId);
  chrome.storage.local.set({ monitoringData: monitoringData });
  updateBadge();
});
