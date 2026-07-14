/** 默认占位地址，请改为你们公司实际的禅道访问地址 */
export const DEFAULT_BASE_URL = 'https://your-zentao-domain.com';

export const STORAGE_KEYS = {
  baseUrl: 'zentaoBaseUrl',
};

export function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

export function getOriginPattern(baseUrl) {
  const origin = new URL(normalizeBaseUrl(baseUrl)).origin;
  return `${origin}/*`;
}

function resolveOriginPatterns(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    return [getOriginPattern(normalized)];
  } catch {
    throw new Error('禅道地址格式不正确，请填写完整 URL（含 http/https）');
  }
}

/** 在 Popup 等用户手势上下文中请求 host 权限 */
export async function requestHostPermission(baseUrl) {
  const origins = resolveOriginPatterns(baseUrl);
  const granted = await chrome.permissions.contains({ origins });
  if (granted) return;

  const approved = await chrome.permissions.request({ origins });
  if (!approved) {
    throw new Error('需要授权访问禅道地址，请在浏览器弹窗中点击「允许」');
  }
}

/** 在 Background 中仅检查权限（不能在此调用 permissions.request） */
export async function ensureHostPermission(baseUrl) {
  const origins = resolveOriginPatterns(baseUrl);
  const granted = await chrome.permissions.contains({ origins });
  if (granted) return;

  throw new Error('尚未授权访问禅道地址，请在设置中点击「保存并授权」');
}

export async function getBaseUrl() {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.baseUrl);
  return normalizeBaseUrl(result[STORAGE_KEYS.baseUrl] || DEFAULT_BASE_URL);
}

export async function setBaseUrl(url) {
  const normalized = normalizeBaseUrl(url);
  if (!normalized) {
    throw new Error('请填写禅道地址');
  }
  await chrome.storage.sync.set({ [STORAGE_KEYS.baseUrl]: normalized });
}
