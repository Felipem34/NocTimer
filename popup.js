document.addEventListener('DOMContentLoaded', () => {
  // Abas
  const tabs = document.querySelectorAll('.tab');
  const containers = document.querySelectorAll('.timer-container');
    const STATE = { READY: 'ready', RUNNING: 'running', PAUSED: 'paused' };

    function formatTime(sec) {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return {
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0')
      };
    }

    function getTimeInputs(container) {
      return {
        hours: container.querySelector('input[id*="hours"]'),
        minutes: container.querySelector('input[id*="minutes"]'),
        seconds: container.querySelector('input[id*="seconds"]')
      };
    }

    function getTotalSeconds(container) {
      const { hours, minutes, seconds } = getTimeInputs(container);
      const h = parseInt(hours.value, 10) || 0;
      const m = parseInt(minutes.value, 10) || 0;
      const s = parseInt(seconds.value, 10) || 0;
      return h * 3600 + m * 60 + s;
    }

    function setTotalSeconds(container, totalSeconds) {
      const { hours, minutes, seconds } = getTimeInputs(container);
      const t = formatTime(totalSeconds);
      hours.value = t.h;
      minutes.value = t.m;
      seconds.value = t.s;
    }

    function setActiveTab(name) {
      tabs.forEach(tab => tab.classList.remove('active'));
      containers.forEach(container => container.classList.add('hidden'));

      const tabEl = document.querySelector(`.tab[data-tab="${name}"]`);
      const contEl = document.querySelector(`.timer-container[data-tab-content="${name}"]`);

      if (tabEl && contEl) {
        tabEl.classList.add('active');
        contEl.classList.remove('hidden');
      }
    }

    chrome.storage.local.get('lastTab', data => {
      if (data.lastTab) setActiveTab(data.lastTab);
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const runningContainer = document.querySelector('.timer-container[data-state="running"]');
        if (runningContainer) {
          const pauseBtn = runningContainer.querySelector('.actions button:not(.cancel-btn)');
          if (pauseBtn) pauseBtn.click();
        }

        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const selected = tab.getAttribute('data-tab');
        containers.forEach(container => {
          container.classList.toggle('hidden', container.getAttribute('data-tab-content') !== selected);
        });

        chrome.storage.local.set({ lastTab: selected });
      });
    });

    const arrows = document.querySelectorAll('.arrow-up, .arrow-down');
    arrows.forEach(arrow => {
      arrow.addEventListener('click', () => {
        const unit = arrow.dataset.unit;
        const container = arrow.closest('.timer-container');
        const input = container.querySelector(`input[id*="${unit}"]`);

        let value = parseInt(input.value, 10) || 0;
        value = arrow.classList.contains('arrow-up') ? value + 1 : Math.max(0, value - 1);
        input.value = String(value).padStart(2, '0');
      });
    });

    const presetButtons = document.querySelectorAll('.presets button');
    presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const preset = parseInt(button.getAttribute('data-preset'), 10) || 0;
        const container = button.closest('.timer-container');
        setTotalSeconds(container, getTotalSeconds(container) + preset);
      });
    });

    containers.forEach(container => {
      const tab = container.getAttribute('data-tab-content');
      const key = `nocTimer-${tab}`;

      const actions = container.querySelector('.actions');
      const mainBtn = actions.querySelector('button');
      const presetsWrap = container.querySelector('.presets');
      const twoHourPresetBtn = presetsWrap.querySelector('button[data-preset="7200"]');

      const resetBtn = document.createElement('button');
      resetBtn.classList.add('cancel-btn');
      resetBtn.textContent = 'Cancelar';
      resetBtn.style.marginRight = '4px';
      resetBtn.style.display = 'none';
      actions.insertBefore(resetBtn, mainBtn);

      let intervalId = null;

      function saveState(data) {
        const payload = {};
        payload[key] = data;
        chrome.storage.local.set(payload);
      }

      function applyPresetVisibility(state) {
        container.classList.toggle('is-paused', state === STATE.PAUSED);

        if (state === STATE.RUNNING) {
          presetsWrap.style.display = 'none';
          if (twoHourPresetBtn) twoHourPresetBtn.style.display = '';
          return;
        }

        presetsWrap.style.display = 'inline-flex';
        if (twoHourPresetBtn) {
          twoHourPresetBtn.style.display = state === STATE.PAUSED ? 'none' : '';
        }
      }

      function updateReadyInitial() {
        if (container.dataset.state !== STATE.READY) return;

        const total = getTotalSeconds(container);
        container.dataset.initial = total;
        saveState({ state: STATE.READY, initial: total });
      }

      function updatePausedRemaining() {
        if (container.dataset.state !== STATE.PAUSED) return;

        const total = getTotalSeconds(container);
        const initial = parseInt(container.dataset.initial, 10) || 0;
        saveState({ state: STATE.PAUSED, remaining: total, initial });
      }

      function tick() {
        const endTime = parseInt(container.dataset.endTime, 10);
        const rem = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));

        setTotalSeconds(container, rem);

        const t = formatTime(rem);
        const badgeText =
          t.h !== '00'
            ? `${parseInt(t.h, 10)}h`
            : t.m !== '00'
              ? `${parseInt(t.m, 10)}m`
              : `${parseInt(t.s, 10)}s`;

        chrome.action.setBadgeText({ text: badgeText });
        chrome.action.setBadgeBackgroundColor({ color: '#FF79C6' });

        if (rem <= 0) {
          clearInterval(intervalId);
          saveState({ state: STATE.READY, initial: parseInt(container.dataset.initial, 10) || 0 });
          chrome.action.setBadgeText({ text: '' });
        }
      }

      function restoreFromState(item) {
        const state = item.state || STATE.READY;
        container.dataset.state = state;

        if (state === STATE.RUNNING && item.endTime) {
          const rem = Math.max(0, Math.ceil((item.endTime - Date.now()) / 1000));
          setTotalSeconds(container, rem);
          mainBtn.textContent = 'Pausar';
          resetBtn.style.display = 'none';
          applyPresetVisibility(STATE.RUNNING);

          container.dataset.endTime = item.endTime;
          if (item.initial != null) container.dataset.initial = item.initial;

          tick();
          intervalId = setInterval(tick, 1000);
          setActiveTab(tab);
          return;
        }

        if (state === STATE.PAUSED && item.remaining != null) {
          setTotalSeconds(container, item.remaining);
          mainBtn.textContent = 'Continuar';
          resetBtn.style.display = 'inline-block';
          applyPresetVisibility(STATE.PAUSED);
          if (item.initial != null) container.dataset.initial = item.initial;
          return;
        }

        const initial = item.initial != null ? item.initial : 0;
        setTotalSeconds(container, initial);
        mainBtn.textContent = 'Começar';
        resetBtn.style.display = 'none';
        applyPresetVisibility(STATE.READY);
      }

      chrome.storage.local.get(key, data => {
        restoreFromState(data[key] || {});
      });

      container.querySelectorAll('.presets button').forEach(button => {
        button.addEventListener('click', updateReadyInitial);
      });

      container.querySelectorAll('.arrow-up, .arrow-down').forEach(arrow => {
        arrow.addEventListener('click', updateReadyInitial);
      });

      container.querySelectorAll('.time-input input').forEach(input => {
        input.addEventListener('input', () => {
          if (container.dataset.state === STATE.READY) updateReadyInitial();
          else if (container.dataset.state === STATE.PAUSED) updatePausedRemaining();
        });
      });

      arrows.forEach(arrow => {
        arrow.addEventListener('click', () => {
          if (container.dataset.state === STATE.PAUSED) {
            setTimeout(updatePausedRemaining, 0);
          }
        });
      });

      mainBtn.addEventListener('click', () => {
        const state = container.dataset.state;

        if (state === STATE.READY) {
          const totalSec = getTotalSeconds(container);
          if (totalSec <= 0) return;

          const endTime = Date.now() + totalSec * 1000;
          container.dataset.initial = totalSec;
          container.dataset.endTime = endTime;
          container.dataset.state = STATE.RUNNING;

          mainBtn.textContent = 'Pausar';
          resetBtn.style.display = 'none';
          applyPresetVisibility(STATE.RUNNING);

          saveState({ state: STATE.RUNNING, endTime, initial: totalSec });
          chrome.runtime.sendMessage({ action: 'createAlarm', key, when: endTime });

          tick();
          intervalId = setInterval(tick, 1000);
          return;
        }

        if (state === STATE.RUNNING) {
          clearInterval(intervalId);

          const endTime = parseInt(container.dataset.endTime, 10);
          const rem = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
          const initial = parseInt(container.dataset.initial, 10) || 0;

          container.dataset.state = STATE.PAUSED;
          mainBtn.textContent = 'Continuar';
          resetBtn.style.display = 'inline-block';
          applyPresetVisibility(STATE.PAUSED);

          saveState({ state: STATE.PAUSED, remaining: rem, initial });
          chrome.runtime.sendMessage({ action: 'clearAlarm', key });
          chrome.action.setBadgeText({ text: '' });
          return;
        }

        if (state === STATE.PAUSED) {
          chrome.storage.local.get(key, data => {
            const item = data[key] || {};

            let rem = getTotalSeconds(container);
            if (rem <= 0) rem = item.remaining || 0;

            const endTime = Date.now() + rem * 1000;
            const initialResume = item.initial || parseInt(container.dataset.initial, 10) || 0;

            container.dataset.endTime = endTime;
            container.dataset.state = STATE.RUNNING;
            container.dataset.initial = initialResume;

            mainBtn.textContent = 'Pausar';
            resetBtn.style.display = 'none';
            applyPresetVisibility(STATE.RUNNING);

            saveState({ state: STATE.RUNNING, endTime, initial: initialResume });
            chrome.runtime.sendMessage({ action: 'createAlarm', key, when: endTime });

            tick();
            intervalId = setInterval(tick, 1000);
          });
        }
      });

      resetBtn.addEventListener('click', () => {
        clearInterval(intervalId);
        chrome.runtime.sendMessage({ action: 'clearAlarm', key });

        const initial = parseInt(container.dataset.initial, 10) || 0;
        setTotalSeconds(container, initial);

        saveState({ state: STATE.READY, initial });
        container.dataset.state = STATE.READY;

        mainBtn.textContent = 'Começar';
        resetBtn.style.display = 'none';
        applyPresetVisibility(STATE.READY);
        chrome.action.setBadgeText({ text: '' });
      });
    });
  });
