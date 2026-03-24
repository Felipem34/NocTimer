document.addEventListener('DOMContentLoaded', () => {
  // Abas
  const tabs = document.querySelectorAll('.tab');
  const containers = document.querySelectorAll('.timer-container');
  // Função para ativar aba por nome
  function setActiveTab(name) {
    tabs.forEach(t => t.classList.remove('active'));
    containers.forEach(c => c.classList.add('hidden'));
    const tabEl = document.querySelector(`.tab[data-tab="${name}"]`);
    const contEl = document.querySelector(`.timer-container[data-tab-content="${name}"]`);
    if (tabEl && contEl) {
      tabEl.classList.add('active');
      contEl.classList.remove('hidden');
    }
  }
  // Restaurar última aba aberta
  chrome.storage.local.get('lastTab', data => {
    if (data.lastTab) setActiveTab(data.lastTab);
  });
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Pausar timer em execução antes de trocar de aba
      const runningContainer = document.querySelector('.timer-container[data-state="running"]');
      if (runningContainer) {
        const pauseBtn = runningContainer.querySelector('.actions button');
        pauseBtn && pauseBtn.click();
      }
      // Troca de abas
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const selected = tab.getAttribute('data-tab');
      containers.forEach(c => {
        c.classList.toggle('hidden', c.getAttribute('data-tab-content') !== selected);
      });
      // Salvar última aba selecionada
      chrome.storage.local.set({ lastTab: selected });
    });
  });

  // Setas de incremento/decremento
  const arrows = document.querySelectorAll('.arrow-up, .arrow-down');
  arrows.forEach(btn => {
    btn.addEventListener('click', () => {
      const unit = btn.dataset.unit;
      const container = btn.closest('.timer-container');
      const input = container.querySelector(`input[id*="${unit}"]`);
      let value = parseInt(input.value, 10) || 0;
      if (btn.classList.contains('arrow-up')) {
        value++;
      } else {
        value = Math.max(0, value - 1);
      }
      input.value = String(value).padStart(2, '0');
    });
  });

  // Presets
  const presets = document.querySelectorAll('.presets button');
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = parseInt(btn.getAttribute('data-preset'), 10) || 0;
      const container = btn.closest('.timer-container');
      const hCur = parseInt(container.querySelector('input[id*="hours"]').value, 10) || 0;
      const mCur = parseInt(container.querySelector('input[id*="minutes"]').value, 10) || 0;
      const sCur = parseInt(container.querySelector('input[id*="seconds"]').value, 10) || 0;
      let total = hCur * 3600 + mCur * 60 + sCur + preset;
      const h = Math.floor(total / 3600);
      total %= 3600;
      const m = Math.floor(total / 60);
      const s = total % 60;
      container.querySelector('input[id*="hours"]').value = String(h).padStart(2, '0');
      container.querySelector('input[id*="minutes"]').value = String(m).padStart(2, '0');
      container.querySelector('input[id*="seconds"]').value = String(s).padStart(2, '0');
    });
  });

  // Lógica do timer
  const STATE = { READY: 'ready', RUNNING: 'running', PAUSED: 'paused' };
  function formatTime(sec) {
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    return { h: String(h).padStart(2,'0'), m: String(m).padStart(2,'0'), s: String(s).padStart(2,'0') };
  }
  document.querySelectorAll('.timer-container').forEach(container => {
    const tab = container.getAttribute('data-tab-content');
    const key = `nocTimer-${tab}`;
    const btn = container.querySelector('.actions button');
    const presetsWrap = container.querySelector('.presets');
    const twoHourPresetBtn = presetsWrap.querySelector('button[data-preset="7200"]');
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Cancelar';
    resetBtn.style.marginRight = '4px';
    resetBtn.style.display = 'none';
    container.querySelector('.actions').insertBefore(resetBtn, btn);
    let intervalId = null;

    function applyPresetVisibility(state) {
      container.classList.toggle('is-paused', state === STATE.PAUSED);
      if (state === STATE.RUNNING) {
        presetsWrap.style.display = 'none';
        if (twoHourPresetBtn) twoHourPresetBtn.style.display = '';
      } else if (state === STATE.PAUSED) {
        presetsWrap.style.display = 'inline-flex';
        if (twoHourPresetBtn) twoHourPresetBtn.style.display = 'none';
      } else {
        presetsWrap.style.display = 'inline-flex';
        if (twoHourPresetBtn) twoHourPresetBtn.style.display = '';
      }
    }

    // Restaurar estado salvo
    chrome.storage.local.get(key, data => {
      const item = data[key] || {};
      const state = item.state || STATE.READY;
      container.dataset.state = state;
      // mostrar tempo conforme estado
      if (state === STATE.RUNNING && item.endTime) {
        const rem = Math.max(0, Math.ceil((item.endTime - Date.now())/1000));
        const t = formatTime(rem);
        container.querySelector('input[id*="hours"]').value = t.h;
        container.querySelector('input[id*="minutes"]').value = t.m;
        container.querySelector('input[id*="seconds"]').value = t.s;
        btn.textContent = 'Pausar';
        resetBtn.style.display = 'none';
        applyPresetVisibility(STATE.RUNNING);
        // Restaurar contagem e iniciar atualização contínua
        container.dataset.endTime = item.endTime;
        if (item.initial != null) container.dataset.initial = item.initial;
        tick();
        intervalId = setInterval(tick, 1000);
        // Garantir aba RUNNING ativa
        setActiveTab(tab);
      } else if (state === STATE.PAUSED && item.remaining != null) {
        const t = formatTime(item.remaining);
        container.querySelector('input[id*="hours"]').value = t.h;
        container.querySelector('input[id*="minutes"]').value = t.m;
        container.querySelector('input[id*="seconds"]').value = t.s;
        btn.textContent = 'Continuar';
        resetBtn.style.display = 'inline-block';
        applyPresetVisibility(STATE.PAUSED);
        if (item.initial != null) container.dataset.initial = item.initial;
      } else {
        // estado READY ou fim, exibir valor inicial
        const t = item.initial != null ? formatTime(item.initial) : formatTime(0);
        container.querySelector('input[id*="hours"]').value = t.h;
        container.querySelector('input[id*="minutes"]').value = t.m;
        container.querySelector('input[id*="seconds"]').value = t.s;
        btn.textContent = 'Começar';
        resetBtn.style.display = 'none';
        applyPresetVisibility(STATE.READY);
      }
    });

    function saveState(data) {
      // data: { state, endTime?, remaining? }
      const obj = {};
      obj[key] = data;
      chrome.storage.local.set(obj);
    }
    // armazenar valor inicial sempre que inputs mudarem em READY
    function updateReadyInitial() {
      if (container.dataset.state !== STATE.READY) return;
      const h = parseInt(container.querySelector('input[id*="hours"]').value,10) || 0;
      const m = parseInt(container.querySelector('input[id*="minutes"]').value,10) || 0;
      const s = parseInt(container.querySelector('input[id*="seconds"]').value,10) || 0;
      const total = h*3600 + m*60 + s;
      container.dataset.initial = total;
      saveState({ state: STATE.READY, initial: total });
    }
    // atualizar remaining enquanto PAUSED permitindo adicionar tempo
    function updatePausedRemaining() {
      if (container.dataset.state !== STATE.PAUSED) return;
      const h = parseInt(container.querySelector('input[id*="hours"]').value,10) || 0;
      const m = parseInt(container.querySelector('input[id*="minutes"]').value,10) || 0;
      const s = parseInt(container.querySelector('input[id*="seconds"]').value,10) || 0;
      const total = h*3600 + m*60 + s;
      const initialStored = parseInt(container.dataset.initial,10) || 0;
      saveState({ state: STATE.PAUSED, remaining: total, initial: initialStored });
    }
    // Eventos para ajustar initial em READY
    container.querySelectorAll('.presets button').forEach(p => p.addEventListener('click', updateReadyInitial));
    container.querySelectorAll('.arrow-up, .arrow-down').forEach(e => e.addEventListener('click', updateReadyInitial));
    // Inputs: em READY atualiza initial; em PAUSED atualiza remaining
    container.querySelectorAll('.time-input input').forEach(inp => inp.addEventListener('input', () => {
      if (container.dataset.state === STATE.READY) updateReadyInitial();
      else if (container.dataset.state === STATE.PAUSED) updatePausedRemaining();
    }));
    // Ajustar setas para também atualizar remaining se pausado
    document.querySelectorAll('.arrow-up, .arrow-down').forEach(btn => {
      btn.addEventListener('click', () => {
        if (container.dataset.state === STATE.PAUSED) {
          // esperar próximo frame para pegar valor atualizado
          setTimeout(updatePausedRemaining, 0);
        }
      });
    });

    function tick() {
      const endTime = parseInt(container.dataset.endTime, 10);
      const now = Date.now();
      const remMs = endTime - now;
      const rem = Math.max(0, Math.ceil(remMs/1000));
      const t = formatTime(rem);
      container.querySelector('input[id*="hours"]').value = t.h;
      container.querySelector('input[id*="minutes"]').value = t.m;
      container.querySelector('input[id*="seconds"]').value = t.s;
      // Atualizar badge com tempo restante
      const badgeText = t.h !== '00' ? `${parseInt(t.h)}h` : (t.m !== '00' ? `${parseInt(t.m)}m` : `${parseInt(t.s)}s`);
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: '#FF79C6' });
      if (rem <= 0) {
        clearInterval(intervalId);
        // encerrar timer e criar alarme; popup reload trará valor inicial via storage
        saveState({ state: STATE.READY, initial: parseInt(container.dataset.initial,10) || 0 });
        chrome.action.setBadgeText({ text: '' });
      }
    }

    btn.addEventListener('click', () => {
      const state = container.dataset.state;
      if (state === STATE.READY) {
        // obter tempo
        const h = parseInt(container.querySelector('input[id*="hours"]').value,10) || 0;
        const m = parseInt(container.querySelector('input[id*="minutes"]').value,10) || 0;
        const s = parseInt(container.querySelector('input[id*="seconds"]').value,10) || 0;
        const totalSec = h*3600 + m*60 + s;
        // não iniciar se timer zerado
        if (totalSec <= 0) {
          return;
        }
        const endTime = Date.now() + totalSec*1000;
        // store original duration for reset
        container.dataset.initial = totalSec;
        container.dataset.endTime = endTime;
        container.dataset.state = STATE.RUNNING;
        btn.textContent = 'Pausar';
        applyPresetVisibility(STATE.RUNNING);
        resetBtn.style.display = 'none';
        // Salvar estado com tempo inicial para reset
        saveState({ state: STATE.RUNNING, endTime, initial: totalSec });
        chrome.runtime.sendMessage({ action: 'createAlarm', key, when: endTime });
        tick();
        intervalId = setInterval(tick,1000);
      } else if (state === STATE.RUNNING) {
        // pausar
        clearInterval(intervalId);
        const endTime = parseInt(container.dataset.endTime,10);
        const rem = Math.max(0, Math.ceil((endTime - Date.now())/1000));
        container.dataset.state = STATE.PAUSED;
        btn.textContent = 'Continuar';
        resetBtn.style.display = 'inline-block';
      // show presets when paused (except 2h)
      applyPresetVisibility(STATE.PAUSED);
      // preserve initial for reset
      const initial = parseInt(container.dataset.initial, 10) || 0;
      saveState({ state: STATE.PAUSED, remaining: rem, initial });
        chrome.runtime.sendMessage({ action: 'clearAlarm', key });
        // Limpar badge ao pausar
        chrome.action.setBadgeText({ text: '' });
      } else if (state === STATE.PAUSED) {
        // continuar
        chrome.storage.local.get(key, data => {
          const item = data[key] || {};
          // pegar tempo atual dos inputs (permite ter adicionado tempo)
          const hCur = parseInt(container.querySelector('input[id*="hours"]').value,10) || 0;
          const mCur = parseInt(container.querySelector('input[id*="minutes"]').value,10) || 0;
          const sCur = parseInt(container.querySelector('input[id*="seconds"]').value,10) || 0;
          let rem = hCur*3600 + mCur*60 + sCur;
          if (rem <= 0) rem = item.remaining || 0; // fallback
          const endTime = Date.now() + rem*1000;
           container.dataset.endTime = endTime;
           container.dataset.state = STATE.RUNNING;
           btn.textContent = 'Pausar';
           resetBtn.style.display = 'none';
          applyPresetVisibility(STATE.RUNNING);
        // preserve initial for reset
        const initialResume = item.initial || parseInt(container.dataset.initial,10) || 0;
         container.dataset.initial = initialResume;
         saveState({ state: STATE.RUNNING, endTime, initial: initialResume });
           chrome.runtime.sendMessage({ action: 'createAlarm', key, when: endTime });
           tick();
           intervalId = setInterval(tick,1000);
         });
      }
    });

    resetBtn.addEventListener('click', () => {
      clearInterval(intervalId);
      chrome.runtime.sendMessage({ action: 'clearAlarm', key });
      // Restaurar valor inicial salvo (usa dataset.initial)
      const ini = parseInt(container.dataset.initial, 10) || 0;
      const t = formatTime(ini);
      container.querySelector('input[id*="hours"]').value = t.h;
      container.querySelector('input[id*="minutes"]').value = t.m;
      container.querySelector('input[id*="seconds"]').value = t.s;
      // Resetar estado
  // Mantém o valor inicial no storage para futuras aberturas do popup
  saveState({ state: STATE.READY, initial: ini });
      container.dataset.state = STATE.READY;
      btn.textContent = 'Começar';
      applyPresetVisibility(STATE.READY);
      resetBtn.style.display = 'none';
      // Limpar badge no estado Ready
      chrome.action.setBadgeText({ text: '' });
    });
  });
});
