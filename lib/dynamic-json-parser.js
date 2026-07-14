/**
 * 解析禅道 my-dynamic t=json 响应
 * data 结构: { dateGroups, users, type, ... }
 */

function toActionList(actions) {
  if (!actions) return [];
  return Array.isArray(actions) ? actions : Object.values(actions);
}

function buildActionText(item) {
  return [item.actionLabel, item.objectLabel, item.objectName]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDynamicJson(data) {
  if (!data || typeof data !== 'object') return { actions: [], users: {} };

  const users = data.users || {};
  const actions = [];

  for (const [dateLabel, groupActions] of Object.entries(data.dateGroups || {})) {
    for (const item of toActionList(groupActions)) {
      actions.push({
        id: item.id,
        actor: item.actor || '',
        actorName: users[item.actor] || item.actor || '',
        date: (item.originalDate || '').slice(0, 10),
        dateLabel,
        time: item.time || '',
        action: buildActionText(item),
        actionCode: item.action || '',
        actionLabel: item.actionLabel || '',
        objectType: item.objectType || '',
        objectID: item.objectID || '',
        objectLabel: item.objectLabel || '',
        objectTitle: item.objectName || '',
        objectName: item.objectName || '',
        objectLink: item.objectLink || '',
        comment: item.comment || '',
        originalDate: item.originalDate || '',
      });
    }
  }

  return { actions, users };
}

export function resolveCurrentUser(data, fallbackAccount = '') {
  const { actions, users } = parseDynamicJson(data);
  const account = actions.find((item) => item.actor)?.actor || fallbackAccount;
  if (!account) return null;

  const realname = users[account] || '';
  return {
    account,
    realname,
    displayName: realname ? `${realname}（${account}）` : account,
  };
}

export function resolveUserFromAccount(account, users = {}) {
  if (!account) return null;
  const realname = users[account] || '';
  return {
    account,
    realname,
    displayName: realname ? `${realname}（${account}）` : account,
  };
}
