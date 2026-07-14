import { getBaseUrl, ensureHostPermission } from './config.js';
import { parseDynamicJson, resolveCurrentUser } from './dynamic-json-parser.js';
import { fetchZentaoText, probeZentaoConnection } from './fetch-proxy.js';
import {
  parseZinBlocks,
  parseDynamicsFromZin,
  parseUserFromZin,
} from './zin-parser.js';

export class ZentaoError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.code = code;
  }
}

const DYNAMIC_TYPE_MAP = {
  daily: 'today',
  weekly: 'thisWeek',
};

async function getSessionId(baseUrl) {
  const candidates = [baseUrl, `${baseUrl}/`, `${baseUrl}/index.php`];
  for (const url of candidates) {
    const cookie = await chrome.cookies.get({ url, name: 'zentaosid' });
    if (cookie?.value) return cookie.value;
  }
  throw new ZentaoError('未检测到禅道登录状态，请先在浏览器中打开禅道并完成登录。', 'NOT_LOGGED_IN');
}

function buildPageUrl(baseUrl, module, method, params = {}, mode = 'json') {
  const url = new URL(`${baseUrl}/index.php`);
  url.searchParams.set('m', module);
  url.searchParams.set('f', method);
  if (mode === 'zin') {
    url.searchParams.set('zin', '1');
  } else {
    url.searchParams.set('t', 'json');
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildSessionUrl(baseUrl, module, method, sessionId, params = {}, mode = 'json') {
  const url = new URL(buildPageUrl(baseUrl, module, method, params, mode));
  url.searchParams.set('zentaosid', sessionId);
  return url.toString();
}

async function requestZentao(baseUrl, module, method, sessionId, params = {}, mode = 'json') {
  const pageUrl = buildPageUrl(baseUrl, module, method, params, mode);
  const sessionUrl = buildSessionUrl(baseUrl, module, method, sessionId, params, mode);
  const { text } = await fetchZentaoText(pageUrl, baseUrl, sessionUrl);
  return text;
}

async function fetchJsonData(baseUrl, module, method, sessionId, params = {}) {
  const text = await requestZentao(baseUrl, module, method, sessionId, params, 'json');
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new ZentaoError(`禅道返回非 JSON：${text.slice(0, 80)}…`, 'INVALID_JSON');
  }

  if (envelope.status === 'fail') {
    throw new ZentaoError(envelope.message || '禅道接口返回失败', 'API_FAIL');
  }

  if (envelope.status !== 'success') {
    throw new ZentaoError(`禅道接口异常：${text.slice(0, 80)}…`, 'API_UNEXPECTED');
  }

  return parseZentaoData(envelope.data);
}

async function fetchZinBlocksData(baseUrl, module, method, sessionId, params = {}) {
  const text = await requestZentao(baseUrl, module, method, sessionId, params, 'zin');
  return parseZinBlocks(text);
}

function parseZentaoData(data) {
  if (data == null) return null;
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'string') return JSON.parse(parsed);
      return parsed;
    } catch {
      return data;
    }
  }
  return data;
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value);
  return [];
}

function normalizeEffort(item) {
  return {
    id: item.id,
    date: (item.date || '').slice(0, 10),
    work: (item.work || '').trim(),
    consumed: Number(item.consumed) || 0,
    objectType: item.objectType || '',
    objectID: item.objectID || item.objectId || '',
    projectName: item.projectName || item.project || '',
    taskName: item.taskName || item.name || '',
  };
}

function normalizeAction(item) {
  return {
    id: item.id,
    date: parseActionDate(item),
    dateLabel: item.dateLabel || '',
    time: item.time || '',
    action: (item.action || item.desc || item.title || item.text || '').trim(),
    actionCode: item.actionCode || '',
    actionLabel: item.actionLabel || '',
    objectType: item.objectType || '',
    objectID: item.objectID || item.objectId || '',
    objectTitle: item.objectTitle || item.objectName || '',
    projectName: item.projectName || '',
    extra: item.extra || '',
  };
}

function parseActionDate(item) {
  const raw = item.originalDate || item.date || item.actionDate || item.createdDate || '';
  return String(raw).slice(0, 10);
}

function normalizeTask(item) {
  return {
    id: item.id,
    name: (item.name || '').trim(),
    status: item.status || '',
    projectName: item.projectName || item.project || '',
    consumed: Number(item.consumed) || 0,
    left: Number(item.left) || 0,
    finishedDate: String(item.finishedDate || '').slice(0, 10),
    realStarted: String(item.realStarted || '').slice(0, 10),
    assignedDate: String(item.assignedDate || '').slice(0, 10),
  };
}

function normalizeTodo(item) {
  return {
    id: item.id,
    name: (item.name || item.title || '').trim(),
    date: String(item.date || item.deadline || '').slice(0, 10),
    status: item.status || '',
    pri: item.pri || '',
  };
}

function extractList(data, keys) {
  if (!data) return [];
  for (const key of keys) {
    if (data[key]) return toArray(data[key]);
  }
  return toArray(data);
}

async function fetchDynamics(baseUrl, sessionId, reportType) {
  const dynamicType = DYNAMIC_TYPE_MAP[reportType] || 'today';

  try {
    const raw = await fetchJsonData(baseUrl, 'my', 'dynamic', sessionId, { type: dynamicType });
    const { actions } = parseDynamicJson(raw);
    return actions.map(normalizeAction);
  } catch (jsonError) {
    console.warn('[zentao] dynamic json failed:', jsonError.message);
  }

  try {
    const blocks = await fetchZinBlocksData(baseUrl, 'my', 'dynamic', sessionId, { type: dynamicType });
    return parseDynamicsFromZin(blocks).map(normalizeAction);
  } catch (zinError) {
    console.warn('[zentao] dynamic zin failed:', zinError.message);
  }

  throw new ZentaoError('无法连接禅道，请打开禅道页面并保持登录后重试', 'DYNAMIC_FETCH_FAIL');
}

export async function fetchWorkData(dateRange, reportType = 'daily') {
  const baseUrl = await getBaseUrl();
  await ensureHostPermission(baseUrl);
  const sessionId = await getSessionId(baseUrl);
  const effortParams = { begin: dateRange.start, end: dateRange.end };

  const dynamics = await fetchDynamics(baseUrl, sessionId, reportType);

  const [effortRaw, taskRaw, todoRaw] = await Promise.all([
    fetchJsonData(baseUrl, 'my', 'effort', sessionId, effortParams).catch(() => null),
    fetchJsonData(baseUrl, 'my', 'work', sessionId, { mode: 'task' }).catch(() => null),
    fetchJsonData(baseUrl, 'my', 'todo', sessionId, { type: 'today' }).catch(() => null),
  ]);

  const efforts = extractList(effortRaw, ['efforts', 'effort', 'datas', 'data'])
    .map(normalizeEffort)
    .filter((item) => item.work || item.consumed);

  const tasks = extractList(taskRaw, ['tasks', 'datas', 'data', 'work']).map(normalizeTask);
  const todos = extractList(todoRaw, ['todos', 'datas', 'data']).map(normalizeTodo);

  return { efforts, dynamics, tasks, todos, baseUrl };
}

function extractUser(data) {
  if (!data || typeof data !== 'object') return null;

  const candidates = [data.user, data.profile, data.currentUser, data.app?.user];
  for (const user of candidates) {
    if (!user || typeof user !== 'object') continue;
    const account = user.account || '';
    const realname = user.realname || user.nickname || '';
    if (account || realname) {
      return {
        account,
        realname,
        displayName: realname ? `${realname}（${account}）` : account,
      };
    }
  }
  return null;
}

async function fetchCurrentUser(baseUrl, sessionId) {
  const dynamicTypes = ['today', 'thisWeek', 'yesterday', 'all'];

  for (const type of dynamicTypes) {
    try {
      const raw = await fetchJsonData(baseUrl, 'my', 'dynamic', sessionId, { type });
      const user = resolveCurrentUser(raw);
      if (user) return user;
    } catch (error) {
      console.warn(`[zentao] user dynamic ${type} failed:`, error.message);
    }
  }

  const zinTargets = [
    { module: 'my', method: 'index', params: {} },
    { module: 'my', method: 'dynamic', params: { type: 'today' } },
    { module: 'my', method: 'dynamic', params: { type: 'thisWeek' } },
  ];

  for (const target of zinTargets) {
    try {
      const blocks = await fetchZinBlocksData(baseUrl, target.module, target.method, sessionId, target.params);
      const user = parseUserFromZin(blocks);
      if (user) return user;
    } catch (error) {
      console.warn(`[zentao] user zin ${target.module}-${target.method} failed:`, error.message);
    }
  }

  const jsonTargets = [
    { module: 'my', method: 'index', params: {} },
    { module: 'user', method: 'profile', params: {} },
    { module: 'my', method: 'profile', params: {} },
  ];

  for (const target of jsonTargets) {
    try {
      const user = extractUser(await fetchJsonData(baseUrl, target.module, target.method, sessionId, target.params));
      if (user) return user;
    } catch (error) {
      console.warn(`[zentao] user json ${target.module}-${target.method} failed:`, error.message);
    }
  }

  return null;
}

async function verifyApiAccess(baseUrl, sessionId) {
  try {
    await fetchJsonData(baseUrl, 'my', 'dynamic', sessionId, { type: 'thisWeek' });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export async function checkLoginStatus() {
  const baseUrl = await getBaseUrl();
  if (baseUrl.includes('your-zentao-domain.com')) {
    return {
      ok: false,
      message: '请先在 ⚙ 设置中填写禅道地址',
      baseUrl,
      user: null,
    };
  }
  try {
    await ensureHostPermission(baseUrl);
    const sessionId = await getSessionId(baseUrl);
    const user = await fetchCurrentUser(baseUrl, sessionId);

    if (user) {
      return { ok: true, baseUrl, user, userResolved: true, hint: '' };
    }

    const api = await verifyApiAccess(baseUrl, sessionId);
    if (api.ok) {
      return {
        ok: true,
        baseUrl,
        user: null,
        userResolved: false,
        hint: '已登录',
      };
    }

    return {
      ok: true,
      baseUrl,
      user: null,
      userResolved: false,
      hint: '已读取 Cookie，请打开禅道页面并保持登录',
    };
  } catch (error) {
    return { ok: false, message: error.message, baseUrl, user: null };
  }
}

export async function runDiagnostics() {
  const baseUrl = await getBaseUrl();
  try {
    await ensureHostPermission(baseUrl);
    const sessionId = await getSessionId(baseUrl);
    return probeZentaoConnection(
      baseUrl,
      (url, module, method, params) => buildPageUrl(url, module, method, params),
      (url, module, method, params) => buildSessionUrl(url, module, method, sessionId, params),
    );
  } catch (error) {
    return {
      ok: false,
      lines: [`✗ ${error.message}`],
      error: error.message,
    };
  }
}
