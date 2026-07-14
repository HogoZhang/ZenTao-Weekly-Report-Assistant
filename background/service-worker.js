import { getDateRange } from '../lib/date-utils.js';
import { fetchWorkData, checkLoginStatus, runDiagnostics } from '../lib/zentao-client.js';
import { buildReport } from '../lib/report-builder.js';
import { getBaseUrl, setBaseUrl } from '../lib/config.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error.message || '未知错误' });
  });
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case 'CHECK_STATUS': {
      const status = await checkLoginStatus();
      return status;
    }
    case 'GET_CONFIG': {
      const baseUrl = await getBaseUrl();
      return { ok: true, baseUrl };
    }
    case 'SAVE_CONFIG': {
      try {
        await setBaseUrl(message.baseUrl);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message || '保存失败' };
      }
    }
    case 'RUN_DIAGNOSTICS': {
      const result = await runDiagnostics();
      return { ok: true, ...result };
    }
    case 'GENERATE_REPORT': {
      const reportType = message.reportType === 'weekly' ? 'weekly' : 'daily';
      const dateRange = getDateRange(reportType);
      const data = await fetchWorkData(dateRange, reportType);
      const report = buildReport(reportType, dateRange, data);
      return {
        ok: true,
        report,
        meta: {
          type: reportType,
          summaryTitle: report.summaryTitle,
          planTitle: report.planTitle,
          dateRange: dateRange.label,
          isEmptySummary: report.isEmptySummary,
          isEmptyPlan: report.isEmptyPlan,
        },
      };
    }
    default:
      return { ok: false, error: '未知操作' };
  }
}
