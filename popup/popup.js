import { requestHostPermission } from '../lib/config.js';

const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const statusSep = document.getElementById('statusSep');
const userName = document.getElementById('userName');
const settingsToggle = document.getElementById('settingsToggle');
const settingsPanel = document.getElementById('settingsPanel');
const baseUrlInput = document.getElementById('baseUrl');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const diagBtn = document.getElementById('diagBtn');
const diagOutput = document.getElementById('diagOutput');
const dailyBtn = document.getElementById('dailyBtn');
const weeklyBtn = document.getElementById('weeklyBtn');
const annualBtn = document.getElementById('annualBtn');
const reportSection = document.getElementById('reportSection');
const reportEmpty = document.getElementById('reportEmpty');
const reportMeta = document.getElementById('reportMeta');
const summaryTitleEl = document.getElementById('summaryTitle');
const planTitleEl = document.getElementById('planTitle');
const summaryOutput = document.getElementById('summaryOutput');
const planOutput = document.getElementById('planOutput');
const copySummaryBtn = document.getElementById('copySummaryBtn');
const copyPlanBtn = document.getElementById('copyPlanBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const exportTxtBtn = document.getElementById('exportTxtBtn');

/** @type {null | { summaryTitle: string, planTitle: string, summary: string, plan: string, fullText: string, type: string }} */
let currentReport = null;

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function setStatus(ok, label, user, hint = '') {
  statusDot.className = `status-dot ${ok ? 'ok' : 'error'}`;

  if (!ok) {
    statusLabel.textContent = hint || label;
    statusSep.classList.add('hidden');
    userName.classList.add('hidden');
    return;
  }

  if (user?.displayName) {
    statusLabel.textContent = '已登录';
    statusSep.classList.remove('hidden');
    userName.textContent = user.displayName;
    userName.classList.remove('hidden');
    return;
  }

  statusLabel.textContent = hint || '已登录';
  statusSep.classList.add('hidden');
  userName.classList.add('hidden');
}

function setLoading(loading) {
  document.body.classList.toggle('loading', loading);
  dailyBtn.disabled = loading;
  weeklyBtn.disabled = loading;
  annualBtn.disabled = loading;
  diagBtn.disabled = loading;
}

function setCopyEnabled(enabled) {
  copySummaryBtn.disabled = !enabled;
  copyPlanBtn.disabled = !enabled;
  copyAllBtn.disabled = !enabled;
  exportTxtBtn.disabled = !enabled;
}

function setSettingsOpen(open) {
  settingsPanel.hidden = false;
  settingsPanel.classList.toggle('is-open', open);
  settingsToggle.classList.toggle('is-active', open);
  settingsToggle.setAttribute('aria-expanded', String(open));
}

function showDiagnostics(lines) {
  diagOutput.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines || '');
  diagOutput.classList.remove('hidden');
}

function showReportPanel(show) {
  reportSection.classList.toggle('hidden', !show);
  reportEmpty.classList.toggle('hidden', show);
}

function renderReport(report, reportType, meta = {}) {
  currentReport = report;
  summaryTitleEl.textContent = report.summaryTitle;
  planTitleEl.textContent = report.planTitle;
  summaryOutput.value = report.summary;
  planOutput.value = report.plan;

  if (meta.isEmptySummary && reportType === 'daily') {
    reportMeta.textContent = '今日日报 · 暂无工作记录';
  } else if (meta.isEmptySummary) {
    reportMeta.textContent = '本周周报 · 本周暂无工作记录';
  } else if (meta.isEmptyPlan) {
    reportMeta.textContent = reportType === 'weekly' ? '本周周报 · 计划待补充' : '今日日报 · 计划待补充';
  } else {
    reportMeta.textContent = reportType === 'weekly' ? '本周周报' : '今日日报';
  }

  showReportPanel(true);
  setCopyEnabled(true);
}

function formatUserError(message) {
  if (!message) return '生成失败，请稍后重试';
  if (message.includes('无法连接禅道') || message.includes('禅道页面')) {
    return '无法连接禅道，请先打开禅道页面并保持登录';
  }
  if (message.includes('未检测到禅道登录') || message.includes('会话已失效')) {
    return '禅道未登录，请先在浏览器中登录禅道';
  }
  if (message.includes('授权')) {
    return message;
  }
  return message;
}

async function refreshStatus() {
  const status = await sendMessage({ type: 'CHECK_STATUS' });
  if (status.ok) {
    setStatus(true, '已登录禅道', status.user, status.hint);
  } else {
    setStatus(false, status.message || '未登录禅道', null);
  }
  return status;
}

async function init() {
  const config = await sendMessage({ type: 'GET_CONFIG' });
  if (config?.baseUrl) {
    baseUrlInput.value = config.baseUrl;
  }
  await refreshStatus();
}

settingsToggle.addEventListener('click', () => {
  const willOpen = !settingsPanel.classList.contains('is-open');
  setSettingsOpen(willOpen);
});

saveConfigBtn.addEventListener('click', async () => {
  const url = baseUrlInput.value.trim();
  if (!url) {
    setStatus(false, '请填写禅道地址', null);
    setSettingsOpen(true);
    return;
  }

  try {
    await requestHostPermission(url);
  } catch (error) {
    setStatus(false, error.message || '授权失败', null);
    return;
  }

  const result = await sendMessage({ type: 'SAVE_CONFIG', baseUrl: url });
  if (!result?.ok) {
    setStatus(false, result.error || '保存失败', null);
    return;
  }
  await refreshStatus();
  if (!userName.classList.contains('hidden')) return;
  setStatus(true, '已保存', null, '已保存，请打开禅道页面并保持登录');
});

diagBtn.addEventListener('click', async () => {
  setSettingsOpen(true);
  diagOutput.textContent = '诊断中…';
  diagOutput.classList.remove('hidden');

  const result = await sendMessage({ type: 'RUN_DIAGNOSTICS' });
  showDiagnostics(result.lines || [result.error || '诊断失败']);
  await refreshStatus();
});

async function generateReport(reportType) {
  setLoading(true);
  showReportPanel(true);
  summaryOutput.value = '正在拉取…';
  planOutput.value = '';
  reportMeta.textContent = '生成中…';
  setCopyEnabled(false);

  try {
    const result = await sendMessage({ type: 'GENERATE_REPORT', reportType });
    if (!result.ok) {
      throw new Error(result.error || '生成失败');
    }
    renderReport(result.report, reportType, result.meta);
  } catch (error) {
    currentReport = null;
    showReportPanel(true);
    const friendly = formatUserError(error.message);
    summaryOutput.value = friendly;
    planOutput.value = '请打开禅道页面并保持登录，或点击 ⚙ → 诊断连接';
    reportMeta.textContent = '生成失败';
    setStatus(false, friendly, null);
    setSettingsOpen(true);
    await refreshStatus();
  } finally {
    setLoading(false);
  }
}

async function copyWithFeedback(button, text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = '已复制';
  button.classList.add('copy-success');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('copy-success');
  }, 1500);
}

function exportTxtFile() {
  if (!currentReport) return;
  const filename = currentReport.type === 'weekly'
    ? `周报-${new Date().toISOString().slice(0, 10)}.txt`
    : `日报-${new Date().toISOString().slice(0, 10)}.txt`;
  const blob = new Blob([currentReport.fullText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function showDevelopingHint(button) {
  const original = button.textContent;
  button.textContent = '开发中…';
  button.classList.add('copy-success');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('copy-success');
  }, 1500);
}

dailyBtn.addEventListener('click', () => generateReport('daily'));
weeklyBtn.addEventListener('click', () => generateReport('weekly'));
annualBtn.addEventListener('click', () => showDevelopingHint(annualBtn));

copySummaryBtn.addEventListener('click', () => copyWithFeedback(copySummaryBtn, summaryOutput.value));
copyPlanBtn.addEventListener('click', () => copyWithFeedback(copyPlanBtn, planOutput.value));
copyAllBtn.addEventListener('click', () => copyWithFeedback(copyAllBtn, currentReport?.fullText || ''));
exportTxtBtn.addEventListener('click', exportTxtFile);

init();
