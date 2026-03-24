// background.js - Service Worker for NocTimer

const UPDATE_SUFFIX = '-update';

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}

function getUpdateAlarmName(key) {
  return `${key}${UPDATE_SUFFIX}`;
}

function formatBadgeText(seconds) {
  if (seconds > 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds > 60) return `${Math.floor(seconds / 60)}m`;
  return `${seconds}s`;
}

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

function clearBadgeAndRestore() {
  clearBadge();
  restoreAlarms();
}

function createTimerAlarms(key, when) {
  chrome.alarms.create(key, { when });
  chrome.alarms.create(getUpdateAlarmName(key), { when: Date.now() + 1000 });
}

function clearTimerAlarms(key) {
  chrome.alarms.clear(key);
  chrome.alarms.clear(getUpdateAlarmName(key));
}

chrome.runtime.onInstalled.addListener(() => {
  // limpar badge ao instalar
  clearBadgeAndRestore();
});

chrome.runtime.onStartup.addListener(() => {
  // limpar badge ao iniciar
  clearBadgeAndRestore();
});

// Listen for messages from popup.js to schedule or clear alarms
chrome.runtime.onMessage.addListener(msg => {
  if (msg.action === 'createAlarm' && msg.key && msg.when) {
    // criar alarme final e o de atualização do badge
    createTimerAlarms(msg.key, msg.when);
  } else if (msg.action === 'clearAlarm' && msg.key) {
    clearTimerAlarms(msg.key);
  }
});

// Alarm triggered
chrome.alarms.onAlarm.addListener(alarm => {
  const name = alarm.name;

  if (name.endsWith(UPDATE_SUFFIX)) {
    const key = name.replace(/-update$/, '');

    chrome.storage.local.get(key, data => {
      const item = data[key];

      if (item && item.state === 'running' && item.endTime) {
        const rem = Math.max(0, Math.ceil((item.endTime - Date.now()) / 1000));
        chrome.action.setBadgeText({ text: formatBadgeText(rem) });
        // agendar próxima atualização em 1s
        chrome.alarms.create(name, { when: Date.now() + 1000 });
      } else {
        // limpar badge e cancelar atualizações
        clearBadge();
        chrome.alarms.clear(name);
      }
    });

    return;
  }

  // alarme final
  chrome.windows.create({
    url: chrome.runtime.getURL('alarm.html'),
    type: 'popup',
    width: 400,
    height: 200
  });

  // limpar badge e cancelar atualização
  clearBadge();
  chrome.alarms.clear(getUpdateAlarmName(name));

  // restaurar estado READY mantendo initial, remover endTime/remaining
  chrome.storage.local.get(name, data => {
    const item = data[name] || {};
    const init = item.initial || 0;
    const obj = {};
    obj[name] = { state: 'ready', initial: init };
    chrome.storage.local.set(obj);
  });
});
