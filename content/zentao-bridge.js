/**
 * 通过禅道页面标签页转发请求（复用页面登录态，最可靠）
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'ZENTAO_FETCH') return undefined;

  fetch(message.url, { credentials: 'include' })
    .then(async (response) => {
      const text = await response.text();
      sendResponse({
        ok: response.ok,
        status: response.status,
        text,
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error.message || '请求失败',
      });
    });

  return true;
});
