import { isDateInRange } from './date-utils.js';

function uniqueLines(lines) {
  return [...new Set(lines.filter(Boolean))];
}

function stripTimePrefix(text) {
  return String(text || '')
    .replace(/^\d{1,2}:\d{2}\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatItemText(text) {
  return stripTimePrefix(text);
}

function formatNumberedLines(lines) {
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

function formatEffortLine(effort) {
  const hours = effort.consumed > 0 ? `（${effort.consumed}h）` : '';
  const prefix = effort.taskName ? `${effort.taskName}：` : '';
  return formatItemText(`${prefix}${effort.work}${hours}`);
}

function isExcludedDynamic(dynamic) {
  if (dynamic.actionLabel === '指派了') return true;

  const code = String(dynamic.actionCode || '').toLowerCase();
  if (code === 'assigned' || code === 'assign') return true;

  const text = stripTimePrefix(dynamic.action || dynamic.text || '');
  return /^指派了(\s|$)/.test(text);
}

function formatDynamicLine(action) {
  const text = action.action || action.objectTitle || '';
  return formatItemText(text);
}

function formatTaskLine(task) {
  const project = task.projectName ? `[${task.projectName}] ` : '';
  return formatItemText(`${project}${task.name}`);
}

function formatTodoLine(todo) {
  return formatItemText(todo.name);
}

function buildSectionContent(lines, emptyText) {
  if (lines.length) return formatNumberedLines(lines);
  return `1. ${emptyText}`;
}

export function buildReport(type, dateRange, data) {
  const { efforts, dynamics, tasks, todos } = data;
  const { start, end } = dateRange;

  const filteredEfforts = efforts.filter((e) => isDateInRange(e.date, start, end));
  const filteredDynamics = dynamics.filter((d) => {
    if (isExcludedDynamic(d)) return false;
    if (d.date && isDateInRange(d.date, start, end)) return true;
    return type === 'daily' || Boolean(d.action);
  });

  const finishedTasks = tasks.filter(
    (t) =>
      (t.status === 'done' || t.status === 'closed') &&
      isDateInRange(t.finishedDate, start, end),
  );

  const workLines = uniqueLines([
    ...filteredEfforts.map(formatEffortLine),
    ...filteredDynamics.map(formatDynamicLine),
    ...finishedTasks.map(formatTaskLine),
  ]);

  const planLines = todos.map(formatTodoLine);

  const summaryTitle = type === 'daily' ? '今日工作总结' : '本周工作总结';
  const planTitle = type === 'daily' ? '明日工作计划' : '下周工作计划';

  const summaryEmptyText = type === 'daily' ? '今日禅道暂无工作记录' : '本周暂无工作记录';

  const summary = buildSectionContent(workLines, summaryEmptyText);
  const plan = planLines.length ? formatNumberedLines(planLines) : '';

  const fullText = [summaryTitle, '', summary, '', planTitle, '', plan].join('\n');

  return {
    type,
    summaryTitle,
    planTitle,
    summary,
    plan,
    fullText,
    isEmptySummary: workLines.length === 0,
    isEmptyPlan: planLines.length === 0,
  };
}
