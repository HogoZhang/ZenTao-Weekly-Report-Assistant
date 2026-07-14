function getOrigin(url) {
  return new URL(url).origin;
}

function isLoginPage(text) {
  const sample = String(text || '').slice(0, 800).toLowerCase();
  return sample.includes('user-login') || sample.includes('m=user&f=login') || sample.includes('请登录');
}

function isZentaoEnvelope(text) {
  try {
    const json = JSON.parse(text);
    return typeof json === 'object' && json !== null && 'status' in json;
  } catch {
    return false;
  }
}

export function validateZentaoResponse(text) {
  if (!text) {
    throw new Error('禅道返回空响应');
  }

  if (isLoginPage(text) && !isZentaoEnvelope(text)) {
    throw new Error('禅道会话已失效，请刷新禅道页面并重新登录');
  }

  if (text.trim().startsWith('<')) {
    throw new Error('禅道返回了 HTML 页面而非 JSON，请确认已登录');
  }
}

export async function findZentaoTab(baseUrl) {
  const origin = getOrigin(baseUrl);
  const tabs = await chrome.tabs.query({});
  return tabs.find((tab) => tab.url?.startsWith(origin)) || null;
}

async function fetchTextInTab(tabId, url) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ZENTAO_FETCH', url });
    if (response?.text) {
      return { text: response.text, method: 'content-script' };
    }
  } catch {
    // content script 未注入，使用 executeScript 兜底
  }

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (fetchUrl) => {
      const res = await fetch(fetchUrl, { credentials: 'include' });
      return { ok: res.ok, status: res.status, text: await res.text() };
    },
    args: [url],
  });

  const result = injection?.result;
  if (!result?.text) {
    throw new Error('页面内请求无返回，请刷新禅道标签页');
  }
  if (!result.ok) {
    throw new Error(`页面请求失败（HTTP ${result.status}）`);
  }

  return { text: result.text, method: 'execute-script' };
}

async function fetchViaContentScript(url, baseUrl) {
  const tab = await findZentaoTab(baseUrl);
  if (!tab?.id) {
    return { success: false, tabFound: false, error: '未找到已打开的禅道标签页' };
  }

  try {
    const { text, method } = await fetchTextInTab(tab.id, url);
    validateZentaoResponse(text);
    return { success: true, tabFound: true, text, via: method, tabId: tab.id };
  } catch (error) {
    return {
      success: false,
      tabFound: true,
      error: `${error.message}（标签页 #${tab.id}）`,
    };
  }
}

async function fetchViaBackground(url) {
  const response = await fetch(url, { credentials: 'include' });
  const text = await response.text();
  validateZentaoResponse(text);
  return { success: true, text, via: 'background', status: response.status };
}

export async function fetchZentaoText(pageUrl, baseUrl, sessionUrl = null) {
  const tabResult = await fetchViaContentScript(pageUrl, baseUrl);
  if (tabResult.success) return tabResult;

  if (sessionUrl) {
    try {
      const backgroundResult = await fetchViaBackground(sessionUrl);
      return backgroundResult;
    } catch (backgroundError) {
      if (tabResult.tabFound) {
        throw new Error(tabResult.error || backgroundError.message);
      }
      throw new Error(`${backgroundError.message}。请先打开禅道页面并保持登录。`);
    }
  }

  if (tabResult.tabFound) {
    throw new Error(tabResult.error || '页面桥接失败');
  }
  throw new Error('未找到禅道标签页，请先打开禅道并保持登录。');
}

export async function probeZentaoConnection(baseUrl, buildPageUrlFn, buildSessionUrlFn) {
  const lines = [];
  const pageUrl = buildPageUrlFn(baseUrl, 'my', 'dynamic', { type: 'today' });
  const sessionUrl = buildSessionUrlFn
    ? buildSessionUrlFn(baseUrl, 'my', 'dynamic', { type: 'today' })
    : pageUrl;

  const cookie = await chrome.cookies.get({ url: baseUrl, name: 'zentaosid' });
  lines.push(cookie?.value ? `✓ Cookie 已读取（${cookie.value.slice(0, 6)}…）` : '✗ 未读取到 zentaosid Cookie');

  const tab = await findZentaoTab(baseUrl);
  lines.push(tab ? `✓ 已找到禅道标签页（#${tab.id}）` : '✗ 未找到禅道标签页');

  lines.push(`请求 URL：${pageUrl}`);

  try {
    const result = await fetchZentaoText(pageUrl, baseUrl, sessionUrl);
    lines.push(`✓ 接口请求成功（${result.via}）`);

    const envelope = JSON.parse(result.text);
    if (envelope.status !== 'success') {
      lines.push(`✗ 接口 status=${envelope.status}`);
      lines.push(`响应摘要：${result.text.slice(0, 120)}…`);
      return { ok: false, lines, error: envelope.message || '接口返回失败' };
    }

    const data = typeof envelope.data === 'string' ? JSON.parse(envelope.data) : envelope.data;
    const groupCount = Object.keys(data.dateGroups || {}).length;
    let actionCount = 0;
    for (const group of Object.values(data.dateGroups || {})) {
      actionCount += Array.isArray(group) ? group.length : Object.keys(group || {}).length;
    }
    lines.push(`✓ 动态数据：${groupCount} 个日期分组，${actionCount} 条记录`);

    const firstGroup = Object.values(data.dateGroups || {})[0];
    const firstItem = Array.isArray(firstGroup) ? firstGroup[0] : null;
    const account = firstItem?.actor || '';
    const realname = account ? data.users?.[account] : '';
    if (account) {
      lines.push(`✓ 当前用户：${realname || account}（${account}）`);
    } else {
      lines.push('✗ 未能识别当前用户');
      lines.push(`data 字段 keys：${Object.keys(data || {}).join(', ') || '无'}`);
    }

    return { ok: actionCount > 0, lines, actionCount, account, realname };
  } catch (error) {
    lines.push(`✗ 请求失败：${error.message}`);
    return { ok: false, lines, error: error.message };
  }
}
