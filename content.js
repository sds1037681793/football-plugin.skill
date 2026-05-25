// 内容脚本：监控Crow*指数变化
(function () {
  "use strict";

  // 存储比赛数据的历史记录
  let matchHistory = {};
  let detectionMode = "percentage"; // 'percentage' | 'absolute'
  let thresholdPercent = 0.1;
  let thresholdAsianPercent = 0.1;
  let thresholdTotalPercent = 0.1;
  let thresholdAsianAbsolute = 0.1;
  let thresholdOverAbsolute = 0.1; // 大球数值差
  let thresholdUnderAbsolute = 0.1; // 小球数值差
  let thresholdTotalAbsolute = 0.1; // 兼容旧变量名,指向Over阈值
  let refreshMs = 5000;
  let intervalId = null;
  let loopRunning = false;      // 防止并发执行
  let mutationTimer = null;     // MutationObserver 防抖计时器
  const crowLog = (...args) => {
    try {
      // console.log("[CrowMon]", ...args);
    } catch (e) {}
  };
  console.log("current url:", window.location.href);
  console.log(
    "window.location.href.includes('live.titan007.com'):",
    window.location.href.includes("live.titan007.com"),
  );
  if (!window.location.href.includes("live.titan007.com")) {
    return;
  }

  console.log("足球Crow*指数监控插件已启动");

  function getCellColorSpec(cell) {
    if (!cell) return { bg: "", color: "" };
    const attrBg = (cell.getAttribute && cell.getAttribute("bgcolor")) || "";
    const styleBg = cell.style && cell.style.backgroundColor;
    const styleColor = cell.style && cell.style.color;
    let computedBg = "";
    let computedColor = "";
    try {
      const cs = window.getComputedStyle ? window.getComputedStyle(cell) : null;
      if (cs) {
        computedBg = cs.backgroundColor || "";
        computedColor = cs.color || "";
      }
    } catch (e) {}

    const bg = attrBg || styleBg || computedBg || "";
    const color = styleColor || computedColor || "";
    return { bg, color };
  }

  // 解析比赛数据
  function parseMatchData() {
    const matches = [];
    const table = document.getElementById("table_live");
    const root = table || document;
    let matchRows = root.querySelectorAll(
      'tr[id^="tr1_"], tr[id^="tr2_"], tr[id^="tr3_"]',
    );
    crowLog(
      'query rows by [id^="tr1_/tr2_/tr3_"] count:',
      matchRows ? matchRows.length : 0,
    );
    if (!matchRows || matchRows.length === 0) {
      matchRows = root.querySelectorAll('tr[onclick*="analysis"]');
      crowLog(
        'fallback to rows by [onclick*="analysis"] count:',
        matchRows ? matchRows.length : 0,
      );
    }
    if (!matchRows || matchRows.length === 0) {
      matchRows = root.querySelectorAll("tr");
      crowLog(
        "fallback to all <tr> in table_live count:",
        matchRows ? matchRows.length : 0,
      );
    }

    matchRows.forEach((row) => {
      try {
        const cells = row.querySelectorAll("td");
        if (cells.length < 6) return;
        const matchId = getMatchIdFromRow(row);
        if (!matchId) return;
        const timeText =
          document.getElementById(`mt_${matchId}`)?.textContent?.trim() ||
          cells[2]?.textContent?.trim() ||
          "";
        const statusText =
          document.getElementById(`time_${matchId}`)?.textContent?.trim() ||
          cells[3]?.textContent?.trim() ||
          "";
        const homeEl =
          document.getElementById(`team1_${matchId}`) ||
          row.querySelector('a[onclick*="showTeamPanlu"]:not([id^="team2_"])');
        const awayEl =
          document.getElementById(`team2_${matchId}`) ||
          row.querySelectorAll('a[onclick*="showTeamPanlu"]')[1];
        const scoreText = cells[5]?.textContent?.trim() || "-";
        const { hs, as } = parseScore(scoreText);
        const odds = parseOddsDetail(matchId, row);
        const leagueCell = cells[1] || null;
        const leagueColors = getCellColorSpec(leagueCell);
        const match = {
          id: String(matchId),
          league: cells[1]?.textContent?.trim() || "",
          leagueBg: leagueColors.bg || "",
          leagueColor: leagueColors.color || "",
          time: timeText,
          status: statusText,
          homeTeam: homeEl?.textContent?.trim() || "",
          awayTeam: awayEl?.textContent?.trim() || "",
          homeScore: hs,
          awayScore: as,
          crowIndex:
            getCrowIndexFromSData(matchId) ||
            extractCrowIndexFromDomRow(row, matchId),
          odds,
          timestamp: Date.now(),
        };
        if (match.homeTeam && match.awayTeam) {
          matches.push(match);
          crowLog("parsed match:", match);
        }
      } catch (error) {
        console.error("解析比赛数据出错:", error);
      }
    });

    crowLog("parsed matches count:", matches.length);
    return matches;
  }

  // 提取Crow*指数
  function extractCrowIndex(cells) {
    let crowIndex = null;

    // 查找包含Crow*指数的单元格
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i]?.textContent?.trim() || "";

      // 匹配类似 "0.74 0.73*" 的格式
      const crowPattern = /(\d+\.\d+)\s+(\d+\.\d+)\*/;
      const match = cellText.match(crowPattern);

      if (match) {
        crowIndex = {
          home: parseFloat(match[1]),
          away: parseFloat(match[2]),
          raw: cellText,
        };
        crowLog("found crowIndex:", crowIndex);
        break;
      }
    }

    if (!crowIndex) crowLog("crowIndex not found in row");
    return crowIndex;
  }

  function getCrowIndexFromSData(matchId) {
    try {
      const s = window.sData;
      if (!s) {
        crowLog("sData not present");
        return null;
      }
      const rec = s[matchId];
      if (!rec || !Array.isArray(rec)) {
        crowLog("sData entry missing for id:", matchId);
        return null;
      }
      const asian = rec[0];
      if (
        !asian ||
        typeof asian[0] !== "number" ||
        typeof asian[2] !== "number"
      ) {
        crowLog("sData asian format invalid for id:", matchId, rec);
        return null;
      }
      const ci = {
        home: asian[0],
        away: asian[2],
        raw: asian.join(","),
        source: "sData",
      };
      crowLog("sData crowIndex for id:", matchId, ci);
      return ci;
    } catch (e) {
      crowLog("getCrowIndexFromSData error:", e);
      return null;
    }
  }
  function getMatchIdFromRow(row) {
    const rid = row.id || "";
    let m = rid.match(/_(\d+)/);
    if (m && m[1]) return m[1];
    const oddsAttr = row.getAttribute("odds");
    if (oddsAttr) {
      const first = String(oddsAttr).split(",")[0];
      if (/^\d+$/.test(first)) return first;
    }
    const team1 = row.querySelector('[id^="team1_"]');
    if (team1) {
      m = team1.id.match(/_(\d+)/);
      if (m && m[1]) return m[1];
    }
    const aloc = row.querySelector("[aloc]");
    if (aloc) {
      const aid = aloc.getAttribute("aloc");
      if (aid) return aid;
    }
    return null;
  }
  function parseScore(text) {
    const t = (text || "").replace(/\s/g, "");
    if (!t || t === "-" || t === "") return { hs: 0, as: 0 };
    const parts = t.split("-");
    const hs = parseInt(parts[0], 10);
    const as = parseInt(parts[1], 10);
    return {
      hs: isNaN(hs) ? 0 : hs,
      as: isNaN(as) ? 0 : as,
    };
  }
  function extractCrowIndexFromDomRow(row, matchId) {
    try {
      const pk = document.getElementById(`pk_${matchId}`);
      let prePair = null;
      let postPair = null;
      if (pk) {
        const tds = Array.from(row.querySelectorAll("td"));
        const pkIndex = tds.indexOf(pk);
        // 读取左侧oddss
        if (pkIndex > 0) {
          const preTd = tds[pkIndex - 1];
          if (preTd && preTd.classList.contains("oddss")) {
            const o1 = preTd.querySelector(".odds1")?.textContent?.trim();
            const o2 = preTd.querySelector(".odds2")?.textContent?.trim();
            const h = parseFloat(o1);
            const a = parseFloat(o2);
            if (!isNaN(h) && !isNaN(a)) {
              prePair = {
                home: h,
                away: a,
                raw: `${o1},${o2}`,
                source: "dom_pre",
              };
              crowLog("DOM pre oddss crowIndex:", matchId, prePair);
            }
          }
        }
        // 读取右侧oddss
        if (pkIndex >= 0 && pkIndex < tds.length - 1) {
          const postTd = tds[pkIndex + 1];
          if (postTd && postTd.classList.contains("oddss")) {
            const o1 = postTd.querySelector(".odds1")?.textContent?.trim();
            const o2 = postTd.querySelector(".odds2")?.textContent?.trim();
            const h = parseFloat(o1);
            const a = parseFloat(o2);
            if (!isNaN(h) && !isNaN(a)) {
              postPair = {
                home: h,
                away: a,
                raw: `${o1},${o2}`,
                source: "dom_post",
              };
              crowLog("DOM post oddss crowIndex:", matchId, postPair);
            }
          }
        }
        // 如果左右都读到，优先使用左侧作为主监控；否则使用右侧；都没有则尝试goal
        if (prePair) return prePair;
        if (postPair) return postPair;
        const goalAttr = pk.getAttribute("goal") || "";
        const tokens = goalAttr.split(",");
        if (tokens.length >= 3) {
          const h = parseFloat(tokens[1]);
          const a = parseFloat(tokens[2]);
          if (!isNaN(h) && !isNaN(a)) {
            const ci = { home: h, away: a, raw: goalAttr, source: "dom_goal" };
            crowLog("DOM goal crowIndex:", matchId, ci);
            return ci;
          }
        }
      } else {
        // 没有pk节点，尝试第一个oddss
        const oddsCell = row.querySelector("td.oddss");
        if (oddsCell) {
          const o1 = oddsCell.querySelector(".odds1")?.textContent?.trim();
          const o2 = oddsCell.querySelector(".odds2")?.textContent?.trim();
          const h = parseFloat(o1);
          const a = parseFloat(o2);
          if (!isNaN(h) && !isNaN(a)) {
            const ci = {
              home: h,
              away: a,
              raw: `${o1},${o2}`,
              source: "dom_firstOddss",
            };
            crowLog("DOM oddss crowIndex:", matchId, ci);
            return ci;
          }
        }
      }
      crowLog("crowIndex not found in DOM for id:", matchId);
      return null;
    } catch (e) {
      crowLog("extractCrowIndexFromDomRow error:", e);
      return null;
    }
  }

  function parseOddsDetail(matchId, row) {
    try {
      const tds = Array.from(row.querySelectorAll("td"));
      const pk = document.getElementById(`pk_${matchId}`);
      if (!pk) return null;
      const pkIndex = tds.indexOf(pk);
      const preTd = pkIndex > 0 ? tds[pkIndex - 1] : null;
      const postTd =
        pkIndex >= 0 && pkIndex < tds.length - 1 ? tds[pkIndex + 1] : null;

      // .odds1/.odds4[0] = 亚盘赔率，.odds2 或 .odds4[1] = 大小球赔率
      const getOdds1 = (el) => {
        if (!el) return null;
        const n = parseFloat(
          el.querySelector(".odds1, .odds4")?.textContent?.trim() || "",
        );
        return isNaN(n) ? null : n;
      };
      const getOdds2 = (el) => {
        if (!el) return null;
        // Format A: .odds2 存大小球赔率
        const o2 = el.querySelector(".odds2");
        if (o2) {
          const n = parseFloat(o2.textContent?.trim() || "");
          if (!isNaN(n)) return n;
        }
        // Format B: 第二个 .odds4 存大小球赔率
        const allOdds4 = el.querySelectorAll(".odds4");
        if (allOdds4.length >= 2) {
          const n = parseFloat(allOdds4[1].textContent?.trim() || "");
          if (!isNaN(n)) return n;
        }
        return null;
      };

      // 亚盘线：优先从 goal 属性读数值（"-2.5"），更可靠
      const goalAttr = pk.getAttribute("goal") || "";
      const goalParts = goalAttr.split(",");
      const asianLine =
        goalParts[0] ||
        pk.querySelector(".odds1, .odds4")?.textContent?.trim() ||
        "";

      // 总分线：从 pk 的 .odds2 读取（"4" 等数字）
      const totalLine =
        pk.querySelector(".odds2")?.textContent?.trim() || "";

      const asian = {
        home: getOdds1(preTd),
        away: getOdds1(postTd),
        line: asianLine,
      };
      const total = {
        over: getOdds2(preTd),
        under: getOdds2(postTd),
        line: totalLine,
      };
      return { asian, total };
    } catch (e) {
      crowLog("parseOddsDetail error:", e);
      return null;
    }
  }

  function formatOverlayTime(ts) {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // 检测Crow*指数变化
  function detectCrowChanges(currentMatches) {
    const significantChanges = [];

    currentMatches.forEach((currentMatch) => {
      if (!currentMatch.odds) return;

      const matchId = currentMatch.id;
      const previousMatch = matchHistory[matchId];

      if (previousMatch && previousMatch.odds) {
        const getAbsChange = (oldVal, newVal) => {
          if (oldVal == null || newVal == null) return null;
          const delta = Math.abs(oldVal - newVal);
          if (delta === 0) return null;
          const percent = oldVal ? (delta / oldVal) * 100 : 0;
          return { change: delta, percent };
        };
        const cur = currentMatch.odds;
        const prev = previousMatch.odds;

        // asian changes
        let pushAsian = false;
        let asianChangeHome = null;
        let asianChangeAway = null;
        if (cur.asian && prev.asian && cur.asian.line === prev.asian.line) {
          if (cur.asian.home != null && prev.asian.home != null) {
            const dec = getAbsChange(prev.asian.home, cur.asian.home);
            const diffH = dec ? dec.change : 0;
            const pctH = dec ? dec.percent : 0;

            // 根据模式判断是否触发
            let shouldTrigger = false;
            if (detectionMode === "percentage") {
              shouldTrigger = !!dec && pctH > thresholdAsianPercent;
            } else if (detectionMode === "absolute") {
              shouldTrigger = !!dec && diffH > thresholdAsianAbsolute;
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
          }
          if (cur.asian.away != null && prev.asian.away != null) {
            const dec = getAbsChange(prev.asian.away, cur.asian.away);
            const diffA = dec ? dec.change : 0;
            const pctA = dec ? dec.percent : 0;

            // 根据模式判断是否触发
            let shouldTrigger = false;
            if (detectionMode === "percentage") {
              shouldTrigger = !!dec && pctA > thresholdAsianPercent;
            } else if (detectionMode === "absolute") {
              shouldTrigger = !!dec && diffA > thresholdAsianAbsolute;
            }

            if (shouldTrigger) {
              pushAsian = true;
              asianChangeAway = {
                old: prev.asian.away,
                new: cur.asian.away,
                change: diffA,
                percent: pctA,
              };
            }
          }
        }

        // total changes
        let pushTotal = false;
        let totalChangeOver = null;
        let totalChangeUnder = null;
        if (cur.total && prev.total && cur.total.line === prev.total.line) {
          if (cur.total.over != null && prev.total.over != null) {
            const dec = getAbsChange(prev.total.over, cur.total.over);
            const diffO = dec ? dec.change : 0;
            const pctO = dec ? dec.percent : 0;

            // 根据模式判断是否触发（使用大球独立阈值）
            let shouldTrigger = false;
            if (detectionMode === "percentage") {
              shouldTrigger = !!dec && pctO > thresholdTotalPercent;
            } else if (detectionMode === "absolute") {
              shouldTrigger = !!dec && diffO > thresholdOverAbsolute; // 使用大球阈值
            }

            if (shouldTrigger) {
              pushTotal = true;
              totalChangeOver = {
                old: prev.total.over,
                new: cur.total.over,
                change: diffO,
                percent: pctO,
              };
            }
          }
          if (cur.total.under != null && prev.total.under != null) {
            // 监控小球赔率变化（使用小球独立阈值）
            const dec = getAbsChange(prev.total.under, cur.total.under);
            const diffU = dec ? dec.change : 0;
            const pctU = dec ? dec.percent : 0;

            // 根据模式判断是否触发（使用小球独立阈值）
            let shouldTrigger = false;
            if (detectionMode === "percentage") {
              shouldTrigger = !!dec && pctU > thresholdTotalPercent;
            } else if (detectionMode === "absolute") {
              shouldTrigger = !!dec && diffU > thresholdUnderAbsolute; // 使用小球阈值
            }

            if (shouldTrigger) {
              pushTotal = true;
              totalChangeUnder = {
                old: prev.total.under,
                new: cur.total.under,
                change: diffU,
                percent: pctU,
              };
            }
          }
        }

        const shouldPush = pushAsian || pushTotal;
        if (shouldPush) {
          const reasonParts = [];
          if (pushAsian) {
            if (asianChangeHome) {
              const sign = cur.asian.home >= prev.asian.home ? "+" : "-";
              let reasonText;
              if (detectionMode === "percentage") {
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
            if (asianChangeAway) {
              const sign = cur.asian.away >= prev.asian.away ? "+" : "-";
              let reasonText;
              if (detectionMode === "percentage") {
                reasonText = `让球客胜: <span style="color:${
                  sign === "+" ? "#d35400" : "#27ae60"
                };font-weight:bold;">${sign}${asianChangeAway.percent.toFixed(2)}%</span>`;
              } else {
                reasonText = `让球客胜: <span style="color:${
                  sign === "+" ? "#d35400" : "#27ae60"
                };font-weight:bold;">${sign}${asianChangeAway.change.toFixed(3)}</span>`;
              }
              reasonParts.push(reasonText);
            }
          }
          if (pushTotal) {
            if (totalChangeOver) {
              const sign = cur.total.over >= prev.total.over ? "+" : "-";
              let reasonText;
              if (detectionMode === "percentage") {
                reasonText = `大球: <span style="color:${
                  sign === "+" ? "#d35400" : "#27ae60"
                };font-weight:bold;">${sign}${totalChangeOver.percent.toFixed(2)}%</span>`;
              } else {
                reasonText = `大球: <span style="color:${
                  sign === "+" ? "#d35400" : "#27ae60"
                };font-weight:bold;">${sign}${totalChangeOver.change.toFixed(3)}</span>`;
              }
              reasonParts.push(reasonText);
            }
            if (totalChangeUnder) {
              const sign = cur.total.under >= prev.total.under ? "+" : "-";
              let reasonText;
              if (detectionMode === "percentage") {
                reasonText = `小球: <span style="color:${
                  sign === "+" ? "#d35400" : "#27ae60"
                };font-weight:bold;">${sign}${totalChangeUnder.percent.toFixed(2)}%</span>`;
              } else {
                reasonText = `小球: <span style="color:${
                  sign === "+" ? "#d35400" : "#27ae60"
                };font-weight:bold;">${sign}${totalChangeUnder.change.toFixed(3)}</span>`;
              }
              reasonParts.push(reasonText);
            }
          }
          significantChanges.push({
            match: currentMatch,
            previous: previousMatch,
            changes: {
              home: asianChangeHome || totalChangeOver || null,
              away: asianChangeAway || totalChangeUnder || null,
            },
            details: {
              asian_home: asianChangeHome
                ? { ...asianChangeHome, line: prev.asian.line }
                : null,
              asian_away: asianChangeAway
                ? { ...asianChangeAway, line: prev.asian.line }
                : null,
              total_over: totalChangeOver
                ? { ...totalChangeOver, line: prev.total.line }
                : null,
              total_under: totalChangeUnder
                ? { ...totalChangeUnder, line: prev.total.line }
                : null,
            },
            reason: reasonParts.join("  "),
          });
        }
      }

      // 更新历史记录
      matchHistory[matchId] = { ...currentMatch };
    });

    return significantChanges;
  }

  // 发送数据到后台脚本（兼容旧版浏览器 Promise）
  function sendDataToBackground(data) {
    try {
      // 检查是否支持 sendMessage 回调
      chrome.runtime.sendMessage(
        {
          type: "CROW_INDEX_CHANGE",
          data: data,
        },
        (response) => {
          // 忽略错误，旧版可能不返回
          const err = chrome.runtime.lastError;
        },
      );
    } catch (error) {
      console.error("发送消息到后台脚本失败:", error);
    }
  }

  function findMatchRowById(matchId) {
    const id = String(matchId);
    const direct =
      document.getElementById(`tr1_${id}`) ||
      document.getElementById(`tr2_${id}`) ||
      document.getElementById(`tr3_${id}`);
    if (direct) return direct;

    const candidates = Array.from(
      document.querySelectorAll(`tr[id$="_${id}"]`),
    );
    if (candidates.length === 0) return null;

    const score = (tr) => {
      let s = 0;
      const tid = tr?.id || "";
      if (tid.startsWith("tr1_")) s += 3;
      else if (tid.startsWith("tr2_")) s += 2;
      else if (tid.startsWith("tr3_")) s += 1;
      if (tr && tr.style && tr.style.display !== "none") s += 1;
      const oc = tr?.getAttribute?.("onclick") || "";
      if (oc.includes("analysis")) s += 1;
      return s;
    };

    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0] || null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const restorePageScroll = (sx, sy) => {
    try {
      requestAnimationFrame(() => {
        try {
          window.scrollTo(sx, sy);
        } catch (e) {}
        requestAnimationFrame(() => {
          try {
            window.scrollTo(sx, sy);
          } catch (e) {}
        });
      });
    } catch (e) {}
  };

  function dispatchClickSequence(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    try {
      el.dispatchEvent(new MouseEvent("mouseover", opts));
    } catch (e) {}
    try {
      el.dispatchEvent(new MouseEvent("mousedown", opts));
    } catch (e) {}
    try {
      el.dispatchEvent(new MouseEvent("mouseup", opts));
    } catch (e) {}
    try {
      el.dispatchEvent(new MouseEvent("click", opts));
    } catch (e) {}
  }

  function existsUnTop(matchId, root) {
    try {
      const r = root || document;
      return !!r.querySelector(
        `a[href*="addConcern(${matchId}"] img[src*="unTop.png"]`,
      );
    } catch (e) {
      return false;
    }
  }

  async function invokeAddConcernViaBackground(matchId, href) {
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "INVOKE_ADD_CONCERN",
            matchId: Number(matchId),
            href: href || "",
          },
          (res) => {
            if (chrome.runtime.lastError) {
              resolve(false);
            } else {
              resolve(!!(res && res.ok));
            }
          },
        );
      });
    } catch (e) {
      return false;
    }
  }

  async function invokeAddConcernViaScriptTag(matchId, href) {
    try {
      const mid = Number(matchId);
      if (!mid) return false;
      const hrefStr = href || "";
      const codeParts = [];
      codeParts.push("try{");
      codeParts.push(
        "var fn=window.addConcern||(window.top&&window.top.addConcern);",
      );
      codeParts.push(
        "if(typeof fn==='function'){fn(" +
          mid +
          ",14);}else if(typeof addConcern==='function'){addConcern(" +
          mid +
          ",14);}",
      );
      if (hrefStr && typeof hrefStr === "string") {
        const code = hrefStr.replace(/^javascript:/, "").trim();
        if (code) codeParts.push(code);
      }
      codeParts.push("}catch(e){}");
      const script = document.createElement("script");
      script.textContent = codeParts.join("");
      (document.head || document.documentElement).appendChild(script);
      script.remove();
      await sleep(120);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function autoClickConcern(matchId, row) {
    try {
      const sx = window.scrollX;
      const sy = window.scrollY;
      const root = row || document;
      const selectorA = `a[title="添加置顶"][href*="addConcern(${matchId}"]`;
      let btn = root.querySelector(selectorA);
      if (!btn) {
        const looseImg = root.querySelector(
          `a[href*="addConcern(${matchId}"] img[src*="unTop.png"]`,
        );
        btn = looseImg ? looseImg.closest("a") : null;
      }

      if (!btn) return false;
      const unTopImg = btn.querySelector('img[src*="unTop.png"]');
      if (!unTopImg) return false;

      const hrefAttr = btn.getAttribute("href") || "";

      try {
        btn.click();
      } catch (e) {}
      dispatchClickSequence(btn);

      await sleep(180);
      if (!existsUnTop(matchId, root)) {
        restorePageScroll(sx, sy);
        return true;
      }

      const ok = await invokeAddConcernViaBackground(matchId, hrefAttr);
      if (ok) {
        await sleep(180);
        if (!existsUnTop(matchId, root)) {
          restorePageScroll(sx, sy);
          return true;
        }
      }
      const ok2 = await invokeAddConcernViaScriptTag(matchId, hrefAttr);
      if (ok2) {
        await sleep(180);
        if (!existsUnTop(matchId, root)) {
          restorePageScroll(sx, sy);
          return true;
        }
      }
      restorePageScroll(sx, sy);
      return false;
    } catch (e) {
      console.error(`自动点击置顶失败 matchId: ${matchId}`, e);
      return false;
    }
  }

  // 播放提示音 (滴滴滴)
  function playAlertSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();

      // 尝试恢复音频上下文（如果被浏览器挂起）
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const beep = (startTime) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(880, startTime); // 880Hz

        gain.gain.setValueAtTime(0.1, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

        osc.start(startTime);
        osc.stop(startTime + 0.15);
      };

      const now = ctx.currentTime;
      // 滴 滴 滴
      beep(now);
      beep(now + 0.2);
      beep(now + 0.4);
    } catch (e) {
      console.error("Play alert sound failed:", e);
    }
  }

  // 监控循环
  async function monitorLoop() {
    if (loopRunning) return;   // 上一轮未完成，跳过本次
    loopRunning = true;
    try {
      const currentMatches = parseMatchData();

      // 检测是否有已完成的比赛，如果有则从监控数据中清除
      // 如果比赛时间大于 100 分钟，或者状态包含 '完', 'FT', 'End'，则认为已完成
      const finishedMatchIds = currentMatches
        .filter((m) => {
          const s = (m.status || "").trim();
          const matchTime = parseInt(s, 10);
          return (
            s === "完" ||
            s.toUpperCase() === "FT" ||
            s.toUpperCase() === "END" ||
            (!isNaN(matchTime) && matchTime > 100)
          );
        })
        .map((m) => m.id);

      if (finishedMatchIds.length > 0) {
        // 从 matchHistory 中立即清除，避免继续对比已结束比赛
        finishedMatchIds.forEach((id) => {
          delete matchHistory[id];
        });

        // 从后台监控数据中清除（只清除 overlayData 里实际存在的条目）
        if (overlayData && overlayData.length > 0) {
          const matchesToRemove = finishedMatchIds.filter((id) =>
            overlayData.some((item) => item.matchId === id),
          );

          if (matchesToRemove.length > 0) {
            try {
              chrome.runtime.sendMessage(
                {
                  type: "REMOVE_FINISHED_MATCHES",
                  matchIds: matchesToRemove,
                },
                (response) => {
                  const e = chrome.runtime.lastError;
                },
              );
            } catch (e) {}
          }
        }
      }

      const significantChanges = detectCrowChanges(currentMatches);

      if (significantChanges.length > 0) {
        console.log("检测到Crow*指数显著变化:", significantChanges);

        let didPinAny = false;
        for (const change of significantChanges) {
          if (change && change.match && change.match.id) {
            const row = findMatchRowById(change.match.id);
            const didPin = await autoClickConcern(change.match.id, row);
            if (didPin) didPinAny = true;
          }
        }
        // 只要检测到显著变化，就播放提示音
        playAlertSound();

        sendDataToBackground(significantChanges);
      }
      crowLog("loop summary:", {
        currentMatches: currentMatches.length,
        significantChanges: significantChanges.length,
      });

      // 清理已离开页面的比赛历史记录（已结束的比赛已在上面 finishedMatchIds 中处理）
      Object.keys(matchHistory).forEach((matchId) => {
        if (!currentMatches.some((match) => match.id === matchId)) {
          delete matchHistory[matchId];
        }
      });
    } catch (error) {
      console.error("监控循环出错:", error);
    } finally {
      loopRunning = false;
    }
  }

  // 启动监控
  function startMonitoring() {
    console.log("开始监控Crow*指数变化...");

    // 立即执行一次
    monitorLoop().catch(() => {});

    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      monitorLoop().catch(() => {});
    }, refreshMs);
    try {
      chrome.runtime.sendMessage({ type: "START_MONITORING" }, (r) => {
        const e = chrome.runtime.lastError;
      });
    } catch (e) {}
    crowLog(
      "monitoring started with interval(ms):",
      refreshMs,
      "threshold(%):",
      thresholdPercent,
    );
  }

  // 等待页面加载完成
  function waitForPageLoad() {
    if (document.readyState === "complete") {
      startMonitoring();
    } else {
      window.addEventListener("load", startMonitoring);
    }
  }

  // 监听来自后台脚本的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_CURRENT_DATA") {
      const currentMatches = parseMatchData();
      sendResponse({ matches: currentMatches, history: matchHistory });
    }
  });

  function loadSettingsAndStart() {
    chrome.storage.local.get(
      [
        "detectionMode",
        "threshold",
        "thresholdAsian",
        "thresholdTotal",
        "thresholdAsianAbsolute",
        "thresholdOverAbsolute",
        "thresholdUnderAbsolute",
        "thresholdTotalAbsolute",
        "refreshInterval",
        "drawerOpen",
        "drawerHeight",
      ],
      (result) => {
        // 加载检测模式
        if (result.detectionMode) {
          detectionMode = result.detectionMode;
        }

        // 加载百分比阈值
        if (typeof result.threshold === "number" && result.threshold > 0) {
          thresholdPercent = result.threshold;
        }
        if (
          typeof result.thresholdAsian === "number" &&
          result.thresholdAsian >= 0
        ) {
          thresholdAsianPercent = result.thresholdAsian;
        } else {
          thresholdAsianPercent = thresholdPercent;
        }
        if (
          typeof result.thresholdTotal === "number" &&
          result.thresholdTotal >= 0
        ) {
          thresholdTotalPercent = result.thresholdTotal;
        } else {
          thresholdTotalPercent = thresholdPercent;
        }

        // 加载数值差阈值
        if (
          typeof result.thresholdAsianAbsolute === "number" &&
          result.thresholdAsianAbsolute > 0
        ) {
          thresholdAsianAbsolute = result.thresholdAsianAbsolute;
        }
        if (
          typeof result.thresholdOverAbsolute === "number" &&
          result.thresholdOverAbsolute > 0
        ) {
          thresholdOverAbsolute = result.thresholdOverAbsolute;
        }
        if (
          typeof result.thresholdUnderAbsolute === "number" &&
          result.thresholdUnderAbsolute > 0
        ) {
          thresholdUnderAbsolute = result.thresholdUnderAbsolute;
        }
        // 兼容旧变量名 thresholdTotalAbsolute
        if (
          typeof result.thresholdTotalAbsolute === "number" &&
          result.thresholdTotalAbsolute > 0
        ) {
          thresholdTotalAbsolute = result.thresholdTotalAbsolute;
          // 如果没有单独设置Over/Under阈值,使用Total阈值
          if (!(typeof result.thresholdOverAbsolute === "number")) {
            thresholdOverAbsolute = result.thresholdTotalAbsolute;
          }
          if (!(typeof result.thresholdUnderAbsolute === "number")) {
            thresholdUnderAbsolute = result.thresholdTotalAbsolute;
          }
        }

        if (
          typeof result.refreshInterval === "number" &&
          result.refreshInterval > 0
        ) {
          refreshMs = result.refreshInterval * 1000;
        }
        createOverlay();
        if (typeof result.drawerOpen === "boolean")
          setDrawerOpen(result.drawerOpen);
        if (
          typeof result.drawerHeight === "number" &&
          result.drawerHeight > 0
        ) {
          drawerHeight = result.drawerHeight;
          applyPanelHeight(drawerHeight);
        }
        seedOverlayFromBackground();
        startMonitoring();
        crowLog("settings loaded:", {
          detectionMode,
          thresholdPercent,
          thresholdAsianPercent,
          thresholdTotalPercent,
          thresholdAsianAbsolute,
          thresholdOverAbsolute,
          thresholdUnderAbsolute,
          thresholdTotalAbsolute,
          refreshMs,
          drawerOpen,
          drawerHeight,
        });
      },
    );
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    // 监听模式变化
    if (changes.detectionMode) {
      detectionMode = changes.detectionMode.newValue;
    }

    // 监听百分比阈值变化
    if (changes.threshold && typeof changes.threshold.newValue === "number") {
      thresholdPercent = changes.threshold.newValue;
    }
    if (
      changes.thresholdAsian &&
      typeof changes.thresholdAsian.newValue === "number"
    ) {
      thresholdAsianPercent = changes.thresholdAsian.newValue;
    }
    if (
      changes.thresholdTotal &&
      typeof changes.thresholdTotal.newValue === "number"
    ) {
      thresholdTotalPercent = changes.thresholdTotal.newValue;
    }

    // 监听数值差阈值变化
    if (
      changes.thresholdAsianAbsolute &&
      typeof changes.thresholdAsianAbsolute.newValue === "number"
    ) {
      thresholdAsianAbsolute = changes.thresholdAsianAbsolute.newValue;
    }
    if (
      changes.thresholdOverAbsolute &&
      typeof changes.thresholdOverAbsolute.newValue === "number"
    ) {
      thresholdOverAbsolute = changes.thresholdOverAbsolute.newValue;
    }
    if (
      changes.thresholdUnderAbsolute &&
      typeof changes.thresholdUnderAbsolute.newValue === "number"
    ) {
      thresholdUnderAbsolute = changes.thresholdUnderAbsolute.newValue;
    }
    // 兼容旧变量名 thresholdTotalAbsolute
    if (
      changes.thresholdTotalAbsolute &&
      typeof changes.thresholdTotalAbsolute.newValue === "number"
    ) {
      thresholdTotalAbsolute = changes.thresholdTotalAbsolute.newValue;
      // 如果Over/Under没有单独设置,同步更新
      if (!changes.thresholdOverAbsolute) {
        thresholdOverAbsolute = changes.thresholdTotalAbsolute.newValue;
      }
      if (!changes.thresholdUnderAbsolute) {
        thresholdUnderAbsolute = changes.thresholdTotalAbsolute.newValue;
      }
    }

    if (
      changes.refreshInterval &&
      typeof changes.refreshInterval.newValue === "number"
    ) {
      refreshMs = changes.refreshInterval.newValue * 1000;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = setInterval(() => {
          monitorLoop().catch(() => {});
        }, refreshMs);
      }
    }
    if (
      changes.monitoringData &&
      Array.isArray(changes.monitoringData.newValue)
    ) {
      overlayData = changes.monitoringData.newValue;
      renderOverlay();
    }
    if (
      changes.drawerOpen &&
      typeof changes.drawerOpen.newValue === "boolean"
    ) {
      setDrawerOpen(changes.drawerOpen.newValue);
    }
    if (
      changes.drawerHeight &&
      typeof changes.drawerHeight.newValue === "number"
    ) {
      drawerHeight = changes.drawerHeight.newValue;
      applyPanelHeight(drawerHeight);
    }
  });

  // 启动
  if (document.readyState === "complete") {
    loadSettingsAndStart();
  } else {
    window.addEventListener("load", loadSettingsAndStart);
  }

  let overlayData = [];
  let overlayRoot = null;
  let panelEl = null;
  let listEl = null;
  let headerRightEl = null;
  let headerEl = null;
  let resizeEl = null;
  let drawerOpen = true;
  let drawerHeight = Math.round(window.innerHeight * 0.6);
  function createOverlay() {
    if (overlayRoot) return;
    overlayRoot = document.createElement("div");
    overlayRoot.id = "crow-monitor-overlay";
    // 改为 relative 或 static，占据文档流空间，避免覆盖
    overlayRoot.style.position = "relative";
    overlayRoot.style.width = "100%";
    overlayRoot.style.zIndex = "9999";
    overlayRoot.style.fontFamily =
      "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif";
    panelEl = document.createElement("div");
    panelEl.style.margin = "0";
    panelEl.style.padding = "0";
    panelEl.style.background = "rgba(255,255,255,0.96)";
    panelEl.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)";
    panelEl.style.borderBottom = "1px solid #e0e0e0";
    panelEl.style.backdropFilter = "blur(6px)";
    panelEl.style.pointerEvents = "auto";
    panelEl.style.display = "flex";
    panelEl.style.flexDirection = "column";
    panelEl.style.maxHeight = "none";

    // 主内容区域（表格）
    listEl = document.createElement("div");
    listEl.id = "crow-monitor-list";
    listEl.style.margin = "0";
    listEl.style.flex = "unset";
    listEl.style.overflowY = "hidden";
    listEl.style.minHeight = "0";

    // 按钮容器（右下角）- 固定在底部
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "8px";
    buttonContainer.style.padding = "8px 12px";
    buttonContainer.style.borderTop = "1px solid #f0f0f0";
    buttonContainer.style.flexShrink = "0";
    buttonContainer.style.background = "rgba(255,255,255,0.98)";

    const info = document.createElement("span");
    info.id = "crow-monitor-info";
    info.style.fontSize = "12px";
    info.style.color = "#666";
    info.style.marginRight = "auto";

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "收起";
    toggleBtn.style.padding = "4px 12px";
    toggleBtn.style.border = "1px solid #ddd";
    toggleBtn.style.borderRadius = "4px";
    toggleBtn.style.background = "#f7f7f7";
    toggleBtn.style.cursor = "pointer";
    toggleBtn.style.fontSize = "12px";
    toggleBtn.style.transition = "background 0.2s";

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "清空";
    clearBtn.style.padding = "4px 12px";
    clearBtn.style.border = "1px solid #ddd";
    clearBtn.style.borderRadius = "4px";
    clearBtn.style.background = "#f7f7f7";
    clearBtn.style.cursor = "pointer";
    clearBtn.style.fontSize = "12px";
    clearBtn.style.transition = "background 0.2s";
    // const settingsBtn = document.createElement("button");
    // settingsBtn.textContent = "设置";
    // settingsBtn.style.padding = "4px 12px";
    // settingsBtn.style.border = "1px solid #ddd";
    // settingsBtn.style.borderRadius = "4px";
    // settingsBtn.style.background = "#f7f7f7";
    // settingsBtn.style.cursor = "pointer";
    // settingsBtn.style.fontSize = "12px";
    // settingsBtn.style.transition = "background 0.2s";

    // 悬停效果
    toggleBtn.onmouseover = () => (toggleBtn.style.background = "#e8e8e8");
    toggleBtn.onmouseout = () => (toggleBtn.style.background = "#f7f7f7");
    clearBtn.onmouseover = () => (clearBtn.style.background = "#e8e8e8");
    clearBtn.onmouseout = () => (clearBtn.style.background = "#f7f7f7");
    // settingsBtn.onmouseover = () => (settingsBtn.style.background = "#e8e8e8");
    // settingsBtn.onmouseout = () => (settingsBtn.style.background = "#f7f7f7");

    buttonContainer.appendChild(info);
    buttonContainer.appendChild(toggleBtn);
    // buttonContainer.appendChild(settingsBtn);
    buttonContainer.appendChild(clearBtn);

    panelEl.appendChild(listEl);
    panelEl.appendChild(buttonContainer);

    // 保留headerRightEl引用以便后续使用
    headerRightEl = buttonContainer;
    resizeEl = document.createElement("div");
    resizeEl.style.height = "6px";
    resizeEl.style.cursor = "ns-resize";
    resizeEl.style.background =
      "linear-gradient(to right, rgba(0,0,0,0.05), rgba(0,0,0,0.1), rgba(0,0,0,0.05))";
    resizeEl.style.borderTop = "1px solid #e0e0e0";
    resizeEl.style.marginTop = "4px";
    panelEl.appendChild(resizeEl);
    overlayRoot.appendChild(panelEl);
    try {
      const menu =
        document.getElementById("site-header-two") ||
        document.getElementById("menu");
      if (menu && menu.parentNode) {
        menu.parentNode.insertBefore(overlayRoot, menu.nextSibling);
      } else if (document.body.firstChild) {
        document.body.insertBefore(
          overlayRoot,
          document.body.firstChild.nextSibling,
        );
      } else {
        document.body.appendChild(overlayRoot);
      }
    } catch (e) {
      document.body.appendChild(overlayRoot);
    }
    toggleBtn.addEventListener("click", () => {
      setDrawerOpen(!drawerOpen);
      chrome.storage.local.set({ drawerOpen });
    });
    clearBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "CLEAR_DATA" }, () => {});
      overlayData = [];
      renderOverlay();
    });
    // settingsBtn.addEventListener("click", () => {
    //   try {
    //     const url = chrome.runtime.getURL("popup.html");
    //     window.open(url, "_blank", "noopener,noreferrer");
    //   } catch (e) {}
    // });
    updateInfoText();
    initResize();
    applyPanelHeight(drawerHeight);
    crowLog("overlay created");
  }
  const mo = new MutationObserver(() => {
    // 防抖：300ms 内的连续变动合并为一次扫描，避免高频触发拖慢浏览器
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      monitorLoop().catch(() => {});
    }, 300);
  });
  try {
    // 只观察赔率表格内的变动，而非整个 body
    const liveTable = document.getElementById("table_live");
    const target = liveTable || document.body;
    mo.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,   // 文字内容变化（赔率数值更新）
      attributes: true,
      attributeFilter: ["goal", "class"],  // 只关注 goal 属性和 class 变化
    });
    crowLog("mutation observer attached to", target.id || "body");
  } catch (e) {}
  function applyPanelHeight(h) {
    if (!panelEl) return;
    const headerH = headerRightEl
      ? headerRightEl.getBoundingClientRect().height
      : 40;
    const resizeH = resizeEl ? resizeEl.getBoundingClientRect().height : 10;
    const available = Math.max(
      160,
      Math.round(h - headerH - resizeH - 16 + 100),
    );
    panelEl.style.setProperty("--crow-table-max-height", `${available}px`);
  }
  function initResize() {
    if (!resizeEl) return;
    let startY = 0;
    let startH = 0;
    let dragging = false;
    const onMouseDown = (e) => {
      dragging = true;
      startY = e.clientY;
      startH = panelEl.getBoundingClientRect().height;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp, { once: true });
    };
    const onMouseMove = (e) => {
      if (!dragging || !drawerOpen) return;
      const delta = e.clientY - startY;
      drawerHeight = Math.round(startH + delta);
      applyPanelHeight(drawerHeight);
    };
    const onMouseUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      chrome.storage.local.set({ drawerHeight });
    };
    resizeEl.addEventListener("mousedown", onMouseDown);
  }
  // 获取联赛背景色（模拟页面颜色）
  function getLeagueBgColor(league) {
    const hash = league
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = [
      "#7dd3c0",
      "#ffa07a",
      "#87cefa",
      "#dda0dd",
      "#f0e68c",
      "#98fb98",
      "#ff9999",
      "#b0c4de",
      "#ffdab9",
      "#e0b0ff",
    ];
    return colors[hash % colors.length];
  }

  // 转换让球盘口数字为中文显示
  function convertHandicapToChinese(line) {
    if (!line || line === "-") return "-";

    const num = parseFloat(line);
    if (isNaN(num)) return line; // 如果已经是中文，直接返回

    const absNum = Math.abs(num);
    const prefix = num < 0 ? "受" : "";

    let text = "";
    if (absNum === 0) text = "平手";
    else if (absNum === 0.25) text = "平/半";
    else if (absNum === 0.5) text = "半球";
    else if (absNum === 0.75) text = "半/一";
    else if (absNum === 1) text = "一球";
    else if (absNum === 1.25) text = "一/球半";
    else if (absNum === 1.5) text = "球半";
    else if (absNum === 1.75) text = "球半/两";
    else if (absNum === 2) text = "两球";
    else if (absNum === 2.25) text = "两/两球半";
    else if (absNum === 2.5) text = "两球半";
    else if (absNum === 2.75) text = "两球半/三";
    else if (absNum === 3) text = "三球";
    else if (absNum === 3.25) text = "三/三球半";
    else if (absNum === 3.5) text = "三球半";
    else if (absNum === 3.75) text = "三球半/四";
    else if (absNum === 4) text = "四球";
    else if (absNum === 4.25) text = "四/四球半";
    else if (absNum === 4.5) text = "四球半";
    else if (absNum === 4.75) text = "四球半/五";
    else if (absNum === 5) text = "五球";
    else text = line; // 其他情况保持原样

    return prefix + text;
  }

  function renderOverlay() {
    const list = listEl || document.getElementById("crow-monitor-list");
    if (!list) return;
    if (!overlayData || overlayData.length === 0) {
      list.innerHTML =
        '<div style="color:#666;font-size:12px;padding:10px;">暂无监控数据</div>';
      updateInfoText();
      return;
    }

    // 按时间排序（最新的在前）
    const sorted = [...overlayData].sort(
      (a, b) =>
        (b.capturedAt || b.lastUpdated || 0) -
        (a.capturedAt || a.lastUpdated || 0),
    );
    const newestTs = sorted[0]
      ? sorted[0].capturedAt || sorted[0].lastUpdated
      : 0;

    // 分成三组：让球触发的、大球触发的、小球触发的
    const asianData = [];
    const overData = [];
    const underData = [];

    sorted.forEach((item) => {
      const d = item.details || {};
      const hasAsian = d.asian_home || d.asian_away;
      const hasOver = d.total_over;
      const hasUnder = d.total_under;

      if (hasAsian) {
        asianData.push(item);
      }
      if (hasOver) {
        overData.push(item);
      }
      if (hasUnder) {
        underData.push(item);
      }
    });

    // 生成表格行的函数
    const generateRow = (item, type) => {
      const m = item.match;
      const d = item.details || {};
      const league = m.league || "";
      const rawBg = m.leagueBg || "";
      const leagueBg =
        rawBg && rawBg !== "rgba(0, 0, 0, 0)" && rawBg !== "transparent"
          ? rawBg
          : getLeagueBgColor(league);
      const leagueColor = m.leagueColor || "#fff";
      const captureCount = item.captureCount || 1;
      const itemTs = item.capturedAt || item.lastUpdated || 0;
      const isNewest = newestTs && itemTs >= newestTs - 1000;

      let handicapOrTotal = "";
      let tip = "";
      let scoreDisplay = "";

      if (type === "asian") {
        const asian = m.odds && m.odds.asian ? m.odds.asian : { line: "-" };
        handicapOrTotal = convertHandicapToChinese(asian.line);
        scoreDisplay = `${m.homeScore}-${m.awayScore}`;
        if (d.asian_home) {
          tip = `${d.asian_home.old.toFixed(2)}→${d.asian_home.new.toFixed(2)}`;
        } else if (d.asian_away) {
          tip = `${d.asian_away.old.toFixed(2)}→${d.asian_away.new.toFixed(2)}`;
        }
      } else if (type === "over" || type === "under") {
        const total = m.odds && m.odds.total ? m.odds.total : { line: "-" };
        handicapOrTotal = total.line;
        // 大球/小球表格显示总进球数
        const totalGoals = (m.homeScore || 0) + (m.awayScore || 0);
        scoreDisplay = `${totalGoals}`;

        if (type === "over" && d.total_over) {
          tip = `${d.total_over.old.toFixed(2)}→${d.total_over.new.toFixed(2)}`;
        } else if (type === "under" && d.total_under) {
          tip = `${d.total_under.old.toFixed(2)}→${d.total_under.new.toFixed(2)}`;
        }
      }

      const dateObj = new Date(itemTs);
      const timeStr = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}:${String(dateObj.getSeconds()).padStart(2, "0")}`;

      return `
        <tr style="border-bottom:1px solid #f0f0f0;${isNewest ? "background:#fffbe6;" : ""}">
          <td style="background:${leagueBg};color:${leagueColor};font-size:9px;padding:1px 2px;white-space:nowrap;max-width:50px;overflow:hidden;text-overflow:ellipsis;" title="${league}">${league}</td>
          <td style="padding:1px 2px;font-size:9px;white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis;" title="${m.homeTeam}">${m.homeTeam}</td>
          <td style="padding:1px 2px;font-size:9px;font-weight:600;color:#e74c3c;text-align:center;white-space:nowrap;">${scoreDisplay}</td>
          <td style="padding:1px 2px;font-size:9px;white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis;" title="${m.awayTeam}">${m.awayTeam}</td>
          <td style="padding:1px 2px;font-size:9px;text-align:center;white-space:nowrap;">${handicapOrTotal}</td>
          <td style="padding:1px 2px;font-size:9px;color:#666;white-space:nowrap;">
            <span style="display:inline-block;background:#e8f4f8;color:#2c7fa0;padding:0px 3px;border-radius:2px;font-size:8px;margin-right:2px;">${captureCount}</span>
            <span style="white-space:nowrap;font-size:8px;">${tip}</span>
          </td>
          <td style="padding:1px 2px;font-size:9px;text-align:center;color:#333;white-space:nowrap;">${m.status || "-"}</td>
          <td style="padding:1px 2px;font-size:9px;text-align:center;color:#999;white-space:nowrap;">${timeStr}</td>
        </tr>
      `;
    };

    // 生成让球表格（更紧凑）
    const asianTableHtml = `
      <div style="flex:1;overflow-y:auto;overflow-x:hidden;max-height:var(--crow-table-max-height, 300px);margin:0">
        <table style="width:100%;border-collapse:collapse;font-size:9px;">
          <thead style="position:sticky;top:0;background:#fff;z-index:1;">
            <tr style="border-bottom:1px solid #ddd;">
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">联赛</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">主队</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">比分</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">客队</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">让分</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">提示</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">赛时</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">时间</th>
            </tr>
          </thead>
          <tbody>
            ${asianData.length > 0 ? asianData.map((item) => generateRow(item, "asian")).join("") : '<tr><td colspan="8" style="padding:8px;text-align:center;color:#999;font-size:9px;">暂无让球数据</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    // 生成大球表格
    const overTableHtml = `
      <div style="flex:1;overflow-y:auto;overflow-x:hidden;max-height:var(--crow-table-max-height, 300px);margin:0">
        <table style="width:100%;border-collapse:collapse;font-size:9px;">
          <thead style="position:sticky;top:0;background:#fff;z-index:1;">
            <tr style="border-bottom:1px solid #ddd;">
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">联赛</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">主队</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">总分</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">客队</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">盘口</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">提示</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">赛时</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">时间</th>
            </tr>
          </thead>
          <tbody>
            ${overData.length > 0 ? overData.map((item) => generateRow(item, "over")).join("") : '<tr><td colspan="8" style="padding:8px;text-align:center;color:#999;font-size:9px;">暂无大球数据</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    // 生成小球表格
    const underTableHtml = `
      <div style="flex:1;overflow-y:auto;overflow-x:hidden;max-height:var(--crow-table-max-height, 300px);margin:0">
        <table style="width:100%;border-collapse:collapse;font-size:9px;">
          <thead style="position:sticky;top:0;background:#fff;z-index:1;">
            <tr style="border-bottom:1px solid #ddd;">
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">联赛</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">主队</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">总分</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">客队</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">盘口</th>
              <th style="padding:2px 1px;text-align:left;font-weight:600;font-size:9px;">提示</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">赛时</th>
              <th style="padding:2px 1px;text-align:center;font-weight:600;font-size:9px;">时间</th>
            </tr>
          </thead>
          <tbody>
            ${underData.length > 0 ? underData.map((item) => generateRow(item, "under")).join("") : '<tr><td colspan="8" style="padding:8px;text-align:center;color:#999;font-size:9px;">暂无小球数据</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    // 三列紧凑布局
    list.innerHTML = `
      <div style="display:flex;gap:3px;padding:3px;">
        ${asianTableHtml}
        ${overTableHtml}
        ${underTableHtml}
      </div>
    `;

    updateInfoText();
  }
  function seedOverlayFromBackground() {
    try {
      chrome.runtime.sendMessage(
        { type: "GET_MONITORING_DATA" },
        (response) => {
          if (chrome.runtime.lastError) return;
          if (response && Array.isArray(response.data)) {
            overlayData = response.data;
            renderOverlay();
          }
        },
      );
    } catch (e) {}
  }
  function setDrawerOpen(open) {
    drawerOpen = open;
    if (!panelEl || !listEl) return;
    if (drawerOpen) {
      applyPanelHeight(drawerHeight);
      listEl.style.display = "block";
      const btn = headerRightEl.querySelector("button");
      if (btn) btn.textContent = "收起";
    } else {
      panelEl.style.maxHeight = "36px";
      listEl.style.display = "none";
      const btn = headerRightEl.querySelector("button");
      if (btn) btn.textContent = "展开";
    }
  }
  function updateInfoText() {
    const el = document.getElementById("crow-monitor-info");
    if (!el) return;
    const count = overlayData ? overlayData.length : 0;
    // el.textContent = `监控:${count} 让球阈值:${thresholdAsianPercent}% 大小阈值:${thresholdTotalPercent}%`;
  }
})();
