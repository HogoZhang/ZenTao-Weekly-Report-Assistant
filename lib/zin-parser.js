/**
 * 禅道 Zin 框架响应解析（zin=1 返回 HTML 片段数组）
 */

export function parseZinBlocks(raw) {
  let blocks;
  try {
    blocks = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  return Array.isArray(blocks) ? blocks : [];
}

export function getZinBlock(blocks, name) {
  return blocks.find((block) => block.name === name) || null;
}

export function parseZinConfig(blocks) {
  const configBlock = getZinBlock(blocks, 'configJS');
  if (!configBlock?.data) return null;

  const match = configBlock.data.match(/window\.config\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function readLeadingText(element) {
  if (!element) return '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = normalizeText(node.textContent);
      if (value) return value;
    }
  }
  return '';
}

function buildDynamicSummary(time, clipText, objectTitle) {
  const summary = normalizeText(clipText);
  if (summary) return time ? `${time} ${summary}` : summary;
  return time && objectTitle ? `${time} ${objectTitle}` : objectTitle;
}

/**
 * 从 Zin 返回的 main HTML 中解析动态列表
 */
export function parseDynamicsFromHtml(html) {
  if (!html) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = [];
  const sections = doc.querySelectorAll('.timeline > li');

  const parseItem = (li, dateLabel) => {
    const time = normalizeText(li.querySelector('.dynamic-tag')?.textContent);
    const clip = li.querySelector('.clip') || li.querySelector('.dynamic-text');
    const link = li.querySelector('a[title], a');
    const clipText = normalizeText(clip?.textContent);
    const objectTitle = link?.getAttribute('title') || normalizeText(link?.textContent);
    const actor = readLeadingText(clip);
    const action = buildDynamicSummary(time, clipText, objectTitle);

    if (!action && !objectTitle) return;

    items.push({
      time,
      dateLabel: dateLabel || '',
      actor,
      action,
      objectTitle,
      href: link?.getAttribute('href') || '',
      text: clipText,
    });
  };

  if (sections.length) {
    sections.forEach((section) => {
      const dateLabel = normalizeText(
        section.querySelector('.cursor-pointer .ml-2, .cursor-pointer span:last-child')?.textContent,
      );
      section.querySelectorAll('ul.dynamic li').forEach((li) => parseItem(li, dateLabel));
    });
  } else {
    doc.querySelectorAll('ul.dynamic li').forEach((li) => parseItem(li, ''));
  }

  return items;
}

export function parseUserFromZin(blocks) {
  const config = parseZinConfig(blocks);
  if (!config?.account) return null;

  const mainHtml = getZinBlock(blocks, 'main')?.data || '';
  const dynamics = parseDynamicsFromHtml(mainHtml);
  const realname = dynamics.find((item) => item.actor)?.actor || '';

  return {
    account: config.account,
    realname,
    displayName: realname ? `${realname}（${config.account}）` : config.account,
  };
}

export function parseDynamicsFromZin(blocks) {
  const mainHtml = getZinBlock(blocks, 'main')?.data || '';
  return parseDynamicsFromHtml(mainHtml);
}
