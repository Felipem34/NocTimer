// background.js - Service Worker for NocTimer

// Setup alarms when extension starts up or is installed
function restoreAlarms() {
  chrome.storage.local.get(null, data => {
    Object.entries(data).forEach(([key, val]) => {
      if (val.state === 'running' && typeof val.remaining === 'number') {
        chrome.alarms.create(key, { when: Date.now() + val.remaining * 1000 });
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  // limpar badge ao instalar
  chrome.action.setBadgeText({ text: '' });
  restoreAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  // limpar badge ao iniciar
  chrome.action.setBadgeText({ text: '' });
  restoreAlarms();
});

// Listen for messages from popup.js to schedule or clear alarms
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'createAlarm' && msg.key && msg.when) {
    // criar alarme final
    chrome.alarms.create(msg.key, { when: msg.when });
    // criar alarme de atualização de badge a cada segundo
    chrome.alarms.create(msg.key + '-update', { when: Date.now() + 1000 });
  } else if (msg.action === 'clearAlarm' && msg.key) {
    chrome.alarms.clear(msg.key);
    chrome.alarms.clear(msg.key + '-update');
  }
});

// Alarm triggered
chrome.alarms.onAlarm.addListener(alarm => {
  const name = alarm.name;
  if (name.endsWith('-update')) {
    const key = name.replace(/-update$/, '');
    chrome.storage.local.get(key, data => {
      const item = data[key];
      if (item && item.state === 'running' && item.endTime) {
        const rem = Math.max(0, Math.ceil((item.endTime - Date.now()) / 1000));
        let text = '';
        if (rem > 3600) text = Math.floor(rem/3600) + 'h';
        else if (rem > 60) text = Math.floor(rem/60) + 'm';
        else text = rem + 's';
        chrome.action.setBadgeText({ text });
        // agendar próxima atualização em 1s
        chrome.alarms.create(name, { when: Date.now() + 1000 });
      } else {
        // limpar badge e cancelar atualizações
        chrome.action.setBadgeText({ text: '' });
        chrome.alarms.clear(name);
      }
    });
  } else {
    // alarme final
    chrome.windows.create({
      url: chrome.runtime.getURL('alarm.html'),
      type: 'popup',
      width: 400,
      height: 200
    });
    // limpar badge e cancelar atualização
    chrome.action.setBadgeText({ text: '' });
    chrome.alarms.clear(name + '-update');
    // restaurar estado READY mantendo initial, remover endTime/remaining
    chrome.storage.local.get(name, data => {
      const item = data[name] || {};
      const init = item.initial || 0;
      const obj = {};
      obj[name] = { state: 'ready', initial: init };
      chrome.storage.local.set(obj);
    });
  }
});
