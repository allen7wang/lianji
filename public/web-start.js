async function start() {
  if (!crossOriginIsolated) {
    if (!('serviceWorker' in navigator)) { document.body.textContent = '此浏览器不支持训练数据库，请使用新版 Chrome 或 Edge。'; return; }
    await navigator.serviceWorker.register('/lianji-web/isolation.js', {scope:'/lianji-web/'});
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) location.reload();
    else navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {once:true});
    return;
  }
  for (const placeholder of document.querySelectorAll('script[data-expo-entry]')) {
    const script = document.createElement('script'); script.src = placeholder.dataset.expoEntry; placeholder.replaceWith(script);
  }
}
start().catch(() => { document.body.textContent = '无法准备训练数据库。请允许此网站的本地存储后刷新重试。'; });
