import { parse } from "yaml";

const POSITIONS = ["left", "center", "right"];
const ENTER_VARIANTS = new Set(["auto", "left", "right", "center", "soft", "none"]);
const DEFAULT_BGM_VOLUME = 0.75;
const DEFAULT_SOUND_VOLUME = 0.8;
const BGM_VOLUME_STORAGE_KEY = "novel-flow-bgm-volume";
const SOUND_VOLUME_STORAGE_KEY = "novel-flow-sound-volume";
const BACKLOG_LIMIT = 200;
const SCENE_TRANSITION_LOGO_PATH = "assets/logo/風見塔のラストノート.png";
const SCENE_TRANSITION_SOUND_ID = "革靴で走る";
const SCENE_TRANSITION_MIN_MS = 900;
const SCENE_TRANSITION_SWAP_DELAY_MS = 120;
const SCENE_TRANSITION_OUTRO_MS = 220;
const EXPRESSION_ALIASES = {
  default: "default",
  neutral: "default",
  normal: "default",
  smile: "smile",
  happy: "smile",
  joy: "smile",
  cry: "cry",
  sad: "sad",
  troubled: "troubled",
  worry: "worry",
  embarrassed: "troubled",
  困り: "troubled",
  笑顔: "smile",
  泣き: "cry",
  通常: "default",
  ニュートラル: "default"
};
const MOTION_ALIASES = {
  shock: "衝撃",
  surprised: "衝撃",
  question: "疑問",
  joy: "喜び",
  blush: "照れ",
  nod: "うなずき"
};
const MOTION_LIBRARY = {
  衝撃: { className: "is-motion-shock", reaction: "!", durationMs: 820 },
  疑問: { className: "is-motion-question", reaction: "?", durationMs: 960 },
  喜び: { className: "is-motion-joy", reaction: "♪", durationMs: 920 },
  照れ: { className: "is-motion-blush", reaction: "…", durationMs: 960 },
  うなずき: { className: "is-motion-nod", reaction: "", durationMs: 700 }
};

function createBgmPlayer() {
  let audio = null;
  let currentId = null;
  let timer = null;
  let resumeHandlers = null;
  let trackVolume = DEFAULT_BGM_VOLUME;
  let masterVolume = loadVolumePreference(BGM_VOLUME_STORAGE_KEY, DEFAULT_BGM_VOLUME);

  function effectiveVolume(volume = trackVolume) {
    return Math.max(0, Math.min(1, volume * masterVolume));
  }

  function clearResumeHandlers() {
    if (!resumeHandlers) {
      return;
    }

    for (const [type, listener] of resumeHandlers) {
      window.removeEventListener(type, listener, true);
    }

    resumeHandlers = null;
  }

  function fadeTo(target, ms, done) {
    clearInterval(timer);

    if (!audio) {
      done?.();
      return;
    }

    const activeAudio = audio;
    const start = activeAudio.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let step = 0;
    timer = setInterval(() => {
      step += 1;
      activeAudio.volume = Math.max(0, Math.min(1, start + (target - start) * (step / steps)));

      if (step >= steps) {
        clearInterval(timer);
        activeAudio.volume = target;
        done?.();
      }
    }, 50);
  }

  function stopWithFade(done) {
    clearResumeHandlers();

    if (!audio) {
      done?.();
      return;
    }

    const activeAudio = audio;
    fadeTo(0, 500, () => {
      activeAudio.pause();

      if (audio === activeAudio) {
        audio = null;
        currentId = null;
      }

      done?.();
    });
  }

  function scheduleResume(activeAudio, volume) {
    clearResumeHandlers();

    const resume = () => {
      if (audio !== activeAudio) {
        clearResumeHandlers();
        return;
      }

      activeAudio
        .play()
        .then(() => {
          clearResumeHandlers();
          fadeTo(effectiveVolume(volume), 1200);
        })
        .catch((error) => {
          console.warn("[BGM] 再試行に失敗しました。", error);
        });
    };

    resumeHandlers = [
      ["pointerdown", resume],
      ["keydown", resume]
    ];

    for (const [type, listener] of resumeHandlers) {
      window.addEventListener(type, listener, true);
    }
  }

  function startPlayback(activeAudio, volume) {
    activeAudio
      .play()
      .then(() => {
        clearResumeHandlers();
        fadeTo(effectiveVolume(volume), 1200);
      })
      .catch((error) => {
        console.warn("[BGM] 自動再生が保留されました。次の操作で再試行します。", error);
        scheduleResume(activeAudio, volume);
      });
  }

  return {
    play(src, id, { loop = true, volume = 0.75 } = {}) {
      trackVolume = volume;

      if (currentId === id && audio) {
        audio.loop = loop;
        startPlayback(audio, trackVolume);
        return;
      }

      stopWithFade(() => {
        audio = new Audio(src);
        audio.loop = loop;
        audio.volume = 0;
        currentId = id;
        startPlayback(audio, trackVolume);
      });
    },
    setMasterVolume(value) {
      masterVolume = normalizeVolume(value, DEFAULT_BGM_VOLUME);
      saveVolumePreference(BGM_VOLUME_STORAGE_KEY, masterVolume, DEFAULT_BGM_VOLUME);

      if (audio) {
        clearInterval(timer);
        audio.volume = effectiveVolume();
      }
    },
    getMasterVolume() {
      return masterVolume;
    },
    stop() {
      stopWithFade();
    }
  };
}

function createSoundPlayer() {
  const activeAudio = new Map();
  let masterVolume = loadVolumePreference(SOUND_VOLUME_STORAGE_KEY, DEFAULT_SOUND_VOLUME);

  function effectiveVolume(volume = 1) {
    return Math.max(0, Math.min(1, volume * masterVolume));
  }

  function release(audio) {
    activeAudio.delete(audio);
  }

  return {
    play(src, { loop = false, volume = 1 } = {}) {
      const audio = new Audio(src);
      const trackVolume = normalizeVolume(volume, 1);
      const cleanup = () => release(audio);

      audio.loop = loop;
      audio.volume = effectiveVolume(trackVolume);
      activeAudio.set(audio, trackVolume);
      audio.addEventListener("ended", cleanup, { once: true });
      audio.addEventListener("error", cleanup, { once: true });
      audio.play().catch((error) => {
        release(audio);
        console.warn("[SOUND] 再生に失敗しました。", error);
      });
    },
    setMasterVolume(value) {
      masterVolume = normalizeVolume(value, DEFAULT_SOUND_VOLUME);
      saveVolumePreference(SOUND_VOLUME_STORAGE_KEY, masterVolume, DEFAULT_SOUND_VOLUME);

      for (const [audio, trackVolume] of activeAudio) {
        audio.volume = effectiveVolume(trackVolume);
      }
    },
    getMasterVolume() {
      return masterVolume;
    },
    stop() {
      for (const audio of activeAudio.keys()) {
        audio.pause();
      }

      activeAudio.clear();
    }
  };
}

const bgmPlayer = createBgmPlayer();
const soundPlayer = createSoundPlayer();

export function createGame(root) {
  root.innerHTML = `
    <main class="novel-app">
      <div class="background-layer" data-background></div>
      <div class="scene-transition" data-scene-transition hidden>
        <div class="scene-transition__card">
          <img class="scene-transition__logo" data-scene-transition-logo alt="風見塔のラストノート" />
          <div class="scene-transition__trail" aria-hidden="true">
            <span class="scene-transition__step"></span>
            <span class="scene-transition__step"></span>
            <span class="scene-transition__step"></span>
          </div>
          <p class="scene-transition__copy">移動中…</p>
        </div>
      </div>
      <section class="stage">
        <header class="top-bar">
          <div class="date-ribbon" data-date-label>--月--日</div>
          <div class="story-meta">
            <div class="scenario-tag" data-title>Novel Flow</div>
            <div class="node-indicator" data-node-indicator>node: -</div>
          </div>
        </header>
        <div class="sprite-layer" data-sprite-layer></div>
        <section class="hud">
          <div class="choices" data-choices hidden></div>
          <div class="dialog-shell">
            <div class="speaker-badge" data-speaker data-position="narration">System</div>
            <div class="text-box">
              <p class="message" data-message>シナリオを選択してください。</p>
            </div>
            <button class="advance-button" type="button" aria-label="次へ" data-advance disabled></button>
          </div>
          <div class="command-bar">
            <button class="command-button" type="button" data-command="scenario" data-clickable="true">
              <span class="command-icon">▶</span>
              <span class="command-label">シナリオ選択</span>
            </button>
            <button class="command-button" type="button" data-command="restart" data-clickable="true">
              <span class="command-icon">R</span>
              <span class="command-label">最初から</span>
            </button>
            <button class="command-button" type="button" data-command="volume" data-clickable="true" aria-expanded="false">
              <span class="command-icon">♪</span>
              <span class="command-label">音量</span>
            </button>
            <button class="command-button" type="button" data-command="qsave">
              <span class="command-icon">S</span>
              <span class="command-label">Q.Save</span>
            </button>
            <button class="command-button" type="button" data-command="qload">
              <span class="command-icon">L</span>
              <span class="command-label">Q.Load</span>
            </button>
            <button class="command-button" type="button" data-command="auto">
              <span class="command-icon">A</span>
              <span class="command-label">Auto</span>
            </button>
            <button class="command-button" type="button" data-command="skip">
              <span class="command-icon">»</span>
              <span class="command-label">Skip</span>
            </button>
            <button class="command-button" type="button" data-command="backlog" data-clickable="true" aria-expanded="false">
              <span class="command-icon">B</span>
              <span class="command-label">Backlog</span>
            </button>
          </div>
          <div class="volume-panel" data-volume-panel hidden>
            <label class="volume-control">
              <span class="volume-label">BGM 音量</span>
              <input class="volume-slider" type="range" min="0" max="100" step="1" value="75" data-bgm-volume-slider />
              <span class="volume-value" data-bgm-volume-value>75%</span>
            </label>
            <label class="volume-control">
              <span class="volume-label">効果音 音量</span>
              <input class="volume-slider" type="range" min="0" max="100" step="1" value="80" data-sound-volume-slider />
              <span class="volume-value" data-sound-volume-value>80%</span>
            </label>
          </div>
        </section>
      </section>
      <aside class="error-box" data-error hidden></aside>
      <div class="backlog-panel" data-backlog-panel hidden>
        <div class="backlog-card">
          <div class="backlog-header">
            <div>
              <p class="backlog-kicker">LOG</p>
              <h1 class="backlog-title">Backlog</h1>
            </div>
            <button class="backlog-close" type="button" data-backlog-close aria-label="Backlog を閉じる">✕</button>
          </div>
          <div class="backlog-list" data-backlog-list></div>
        </div>
      </div>
      <div class="player-setup" data-player-setup hidden>
        <div class="player-card">
          <p class="player-kicker">ROMANCE MODE</p>
          <h1 class="player-title" data-player-title>主人公の名前を決める</h1>
          <p class="player-copy" data-player-copy>呼ばれたい名前で物語を始めます。</p>
          <form class="player-form" data-player-form>
            <label class="player-field">
              <span class="player-field-label" data-player-label>名前</span>
              <input class="player-input" type="text" maxlength="20" autocomplete="nickname" data-player-input />
            </label>
            <div class="player-presets" data-player-presets></div>
            <button class="player-submit" type="submit" data-player-submit>この名前で始める</button>
          </form>
        </div>
      </div>
      <div class="scenario-picker" data-scenario-picker>
        <div class="picker-panel">
          <h1 class="picker-title">シナリオ選択</h1>
          <div class="picker-list" data-picker-list></div>
          <button class="picker-close" type="button" data-picker-close hidden>✕ 閉じる</button>
        </div>
      </div>
    </main>
  `;

  const ui = getUi(root);
  const engine = createEngine(ui);

  ui.advanceButton.addEventListener("click", () => engine.advance());
  ui.restartButton.addEventListener("click", () => engine.restart());
  ui.scenarioButton.addEventListener("click", () => {
    engine.closeBacklog();
    openPicker(ui, engine);
  });
  ui.volumeButton.addEventListener("click", () => {
    engine.closeBacklog();
    toggleVolumePanel(ui);
  });
  ui.backlogButton.addEventListener("click", () => engine.toggleBacklog());
  ui.backlogClose.addEventListener("click", () => engine.closeBacklog());
  ui.backlogPanel.addEventListener("click", (event) => {
    if (event.target === ui.backlogPanel) {
      engine.closeBacklog();
    }
  });
  ui.pickerClose.addEventListener("click", () => closePicker(ui));
  ui.bgmVolumeSlider.addEventListener("input", (event) => {
    engine.setBgmVolume(event.target.value);
    syncVolumeControl(ui.bgmVolumeSlider, ui.bgmVolumeValue, engine.getBgmVolume());
  });
  ui.soundVolumeSlider.addEventListener("input", (event) => {
    engine.setSoundVolume(event.target.value);
    syncVolumeControl(ui.soundVolumeSlider, ui.soundVolumeValue, engine.getSoundVolume());
  });
  ui.playerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    engine.confirmPlayerName(ui.playerInput.value);
  });
  ui.playerPresets.addEventListener("click", (event) => {
    const button = event.target.closest("[data-player-preset]");

    if (!button) {
      return;
    }

    ui.playerInput.value = button.dataset.playerPreset ?? "";
    ui.playerInput.focus();
    ui.playerInput.select();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      engine.closeBacklog();
    }
  });

  syncVolumeControl(ui.bgmVolumeSlider, ui.bgmVolumeValue, engine.getBgmVolume());
  syncVolumeControl(ui.soundVolumeSlider, ui.soundVolumeValue, engine.getSoundVolume());
  openPicker(ui, engine);
}

function getUi(root) {
  return {
    root,
    background: root.querySelector("[data-background]"),
    sceneTransition: root.querySelector("[data-scene-transition]"),
    sceneTransitionLogo: root.querySelector("[data-scene-transition-logo]"),
    spriteLayer: root.querySelector("[data-sprite-layer]"),
    dateLabel: root.querySelector("[data-date-label]"),
    title: root.querySelector("[data-title]"),
    nodeIndicator: root.querySelector("[data-node-indicator]"),
    speaker: root.querySelector("[data-speaker]"),
    message: root.querySelector("[data-message]"),
    choices: root.querySelector("[data-choices]"),
    advanceButton: root.querySelector("[data-advance]"),
    restartButton: root.querySelector('[data-command="restart"]'),
    scenarioButton: root.querySelector('[data-command="scenario"]'),
    volumeButton: root.querySelector('[data-command="volume"]'),
    backlogButton: root.querySelector('[data-command="backlog"]'),
    volumePanel: root.querySelector("[data-volume-panel]"),
    bgmVolumeSlider: root.querySelector("[data-bgm-volume-slider]"),
    bgmVolumeValue: root.querySelector("[data-bgm-volume-value]"),
    soundVolumeSlider: root.querySelector("[data-sound-volume-slider]"),
    soundVolumeValue: root.querySelector("[data-sound-volume-value]"),
    backlogPanel: root.querySelector("[data-backlog-panel]"),
    backlogList: root.querySelector("[data-backlog-list]"),
    backlogClose: root.querySelector("[data-backlog-close]"),
    scenarioPicker: root.querySelector("[data-scenario-picker]"),
    pickerList: root.querySelector("[data-picker-list]"),
    pickerClose: root.querySelector("[data-picker-close]"),
    playerSetup: root.querySelector("[data-player-setup]"),
    playerForm: root.querySelector("[data-player-form]"),
    playerTitle: root.querySelector("[data-player-title]"),
    playerCopy: root.querySelector("[data-player-copy]"),
    playerLabel: root.querySelector("[data-player-label]"),
    playerInput: root.querySelector("[data-player-input]"),
    playerPresets: root.querySelector("[data-player-presets]"),
    playerSubmit: root.querySelector("[data-player-submit]"),
    error: root.querySelector("[data-error]")
  };
}

function createEngine(ui) {
  const state = {
    scenario: null,
    currentNodeId: "",
    actionIndex: 0,
    variables: {},
    sprites: {},
    dateLabel: "",
    waitingForChoice: false,
    ended: false,
    awaitingPlayerName: false,
    playerConfig: null,
    lastPlayerName: "",
    spriteSerial: 0,
    motionSerial: 0,
    transitionSerial: 0,
    isTransitioning: false,
    lastSpeakerLabel: "System",
    lastSpeakerCharacterId: null,
    lastSpeakerPosition: "narration",
    typing: false,
    typingTimer: null,
    typingFullText: "",
    backlog: [],
    backlogOpen: false
  };

  const api = {
    async load(url) {
      try {
        const scenario = await loadScenario(url);
        bgmPlayer.stop();
        soundPlayer.stop();
        prepareScenario(state, scenario, { playerName: state.lastPlayerName });
        renderShell(ui, state);

        if (state.awaitingPlayerName) {
          openPlayerSetup(ui, state);
          return;
        }

        closePlayerSetup(ui);
        api.advance();
      } catch (error) {
        renderError(ui, formatError(error));
      }
    },

    advance() {
      if (!state.scenario || state.waitingForChoice || state.ended || state.awaitingPlayerName || state.isTransitioning) {
        return;
      }

      if (state.typing) {
        completeTypewriter(ui, state);
        return;
      }

      clearChoices(ui);
      renderError(ui, "");
      runUntilPause(state, ui, api);
    },

    restart() {
      if (!state.scenario) {
        return;
      }

      bgmPlayer.stop();
      soundPlayer.stop();
      prepareScenario(state, state.scenario, {
        playerName: state.lastPlayerName || getByPath(state.variables, "player.name"),
        skipPlayerPrompt: Boolean(state.playerConfig)
      });
      renderShell(ui, state);
      closePlayerSetup(ui);
      api.advance();
    },

    confirmPlayerName(rawValue) {
      if (!state.playerConfig) {
        return;
      }

      const playerName = normalizePlayerName(rawValue, state.playerConfig);
      state.lastPlayerName = playerName;
      setByPath(state.variables, "player.name", playerName);
      state.awaitingPlayerName = false;
      closePlayerSetup(ui);
      api.advance();
    },
    setBgmVolume(rawValue) {
      bgmPlayer.setMasterVolume(Number(rawValue) / 100);
    },
    getBgmVolume() {
      return Math.round(bgmPlayer.getMasterVolume() * 100);
    },
    setSoundVolume(rawValue) {
      soundPlayer.setMasterVolume(Number(rawValue) / 100);
    },
    getSoundVolume() {
      return Math.round(soundPlayer.getMasterVolume() * 100);
    },
    toggleBacklog() {
      if (state.backlogOpen) {
        closeBacklog(ui, state);
        return;
      }

      openBacklog(ui, state);
    },
    closeBacklog() {
      closeBacklog(ui, state);
    },

    isLoaded() {
      return state.scenario !== null;
    }
  };

  return api;
}

async function loadScenario(url) {
  const [scenarioResponse, assetManifest] = await Promise.all([
    fetch(url),
    loadAssetManifest()
  ]);

  if (!scenarioResponse.ok) {
    throw new Error(`シナリオを取得できませんでした: ${scenarioResponse.status} ${scenarioResponse.statusText}`);
  }

  const text = await scenarioResponse.text();
  const scenario = parse(text);

  validateScenario(scenario);
  scenario.assetManifest = assetManifest;
  return scenario;
}

async function loadAssetManifest() {
  try {
    const response = await fetch(toAppUrl("assets/manifest.json"), { cache: "no-store" });

    if (!response.ok) {
      return createEmptyAssetManifest();
    }

    return response.json();
  } catch {
    return createEmptyAssetManifest();
  }
}

function createEmptyAssetManifest() {
  return {
    backgrounds: {},
    characters: {},
    bgm: {},
    sound: {}
  };
}

function validateScenario(scenario) {
  if (!scenario || typeof scenario !== "object") {
    throw new Error("YAML のルートはオブジェクトである必要があります。");
  }

  if (!scenario.start || typeof scenario.start !== "string") {
    throw new Error("`start` に開始ノード名を指定してください。");
  }

  if (!scenario.nodes || typeof scenario.nodes !== "object") {
    throw new Error("`nodes` が必要です。");
  }

  if (!Array.isArray(scenario.nodes[scenario.start])) {
    throw new Error("`start` で指定したノードが存在しません。");
  }
}

function prepareScenario(state, scenario, options = {}) {
  state.transitionSerial += 1;
  state.isTransitioning = false;
  state.scenario = scenario;
  state.variables = structuredClone(scenario.variables ?? {});
  state.currentNodeId = scenario.start;
  state.actionIndex = 0;
  state.sprites = {};
  state.dateLabel = scenario.dateLabel ?? scenario.ui?.dateLabel ?? "";
  state.waitingForChoice = false;
  state.ended = false;
  state.spriteSerial = 0;
  state.motionSerial = 0;
  state.lastSpeakerLabel = "System";
  state.lastSpeakerCharacterId = null;
  state.lastSpeakerPosition = "narration";
  cancelTypewriter(state);
  state.typing = false;
  state.typingFullText = "";
  state.backlog = [];
  state.backlogOpen = false;
  state.playerConfig = normalizePlayerConfig(scenario.player);

  if (state.playerConfig) {
    const initialName = normalizePlayerName(
      options.playerName || getByPath(state.variables, "player.name"),
      state.playerConfig
    );
    setByPath(state.variables, "player.name", initialName);
    state.lastPlayerName = initialName;
    state.awaitingPlayerName = !options.skipPlayerPrompt;
  } else {
    state.awaitingPlayerName = false;
  }
}

function normalizePlayerConfig(player) {
  if (!player || typeof player !== "object") {
    return null;
  }

  const presets = Array.isArray(player.presets)
    ? player.presets.map((value) => String(value).trim()).filter(Boolean).slice(0, 6)
    : [];

  return {
    title: String(player.title ?? "主人公の名前を決める"),
    prompt: String(player.prompt ?? "呼ばれたい名前を入力してください。"),
    label: String(player.label ?? "主人公の名前"),
    placeholder: String(player.placeholder ?? "例: 湊"),
    confirmLabel: String(player.confirmLabel ?? "この名前で始める"),
    defaultName: String(player.defaultName ?? player.default ?? "あなた"),
    presets
  };
}

function normalizePlayerName(rawValue, config) {
  const value = String(rawValue ?? "").trim();
  return value || config.defaultName || "あなた";
}

function renderShell(ui, state) {
  ui.title.textContent = state.scenario.title ?? "Novel Flow";
  ui.dateLabel.textContent = state.dateLabel || "--月--日";
  ui.background.style.backgroundImage = "";
  hideSceneTransition(ui, state);
  renderSpeakerBadge(ui, "System", "narration");
  ui.message.textContent = state.awaitingPlayerName ? "主人公の名前を決めてください。" : "開始します。";
  ui.advanceButton.disabled = false;
  renderNodeIndicator(ui, state);
  renderSprites(ui, state);
  clearChoices(ui);
  closeBacklog(ui, state);
  renderError(ui, "");
}

function runUntilPause(state, ui, api) {
  while (!state.waitingForChoice && !state.ended) {
    const action = getCurrentAction(state);

    if (!action) {
      state.ended = true;
      renderSpeakerBadge(ui, "System", "narration");
      ui.message.textContent = "シナリオの終端です。";
      ui.advanceButton.disabled = true;
      return;
    }

    const shouldPause = executeAction(action, state, ui, api);

    if (shouldPause) {
      return;
    }
  }
}

function getCurrentAction(state) {
  const node = state.scenario.nodes[state.currentNodeId];

  if (!Array.isArray(node)) {
    throw new Error(`ノード \`${state.currentNodeId}\` が存在しないか、配列ではありません。`);
  }

  return node[state.actionIndex] ?? null;
}

function executeAction(action, state, ui, api) {
  const [type, payload] = getActionEntry(action);

  switch (type) {
    case "background":
      stepNext(state, ui);
      applyBackground(payload, state, ui)
        .then(() => {
          if (!state.waitingForChoice && !state.ended && !state.awaitingPlayerName) {
            api.advance();
          }
        })
        .catch((error) => {
          state.isTransitioning = false;
          hideSceneTransition(ui, state);
          renderError(ui, formatError(error));
        });
      return true;
    case "date":
      applyDate(payload, state, ui);
      stepNext(state, ui);
      return false;
    case "show":
      applyShow(payload, state, ui);
      stepNext(state, ui);
      return false;
    case "hide":
      applyHide(payload, state, ui);
      stepNext(state, ui);
      return false;
    case "motion":
      applyMotion(payload, state, ui);
      stepNext(state, ui);
      return false;
    case "say":
      applySay(payload, state, ui);
      stepNext(state, ui);
      return true;
    case "choice":
      applyChoice(payload, state, ui, api);
      stepNext(state, ui);
      return true;
    case "bgm":
      applyBgm(payload, state);
      stepNext(state, ui);
      return false;
    case "sound":
    case "se":
    case "sfx":
      applySound(payload, state);
      stepNext(state, ui);
      return false;
    case "set":
      applySet(payload, state);
      stepNext(state, ui);
      return false;
    case "goto":
      jumpToNode(payload, state, ui);
      return false;
    case "if":
      applyIf(payload, state, ui);
      return false;
    default:
      throw new Error(`未対応のアクションです: ${type}`);
  }
}

function getActionEntry(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("各アクションは `- say: ...` のようなオブジェクトで記述してください。");
  }

  const entries = Object.entries(action);

  if (entries.length !== 1) {
    throw new Error(`アクションは1キーだけ持てます: ${JSON.stringify(action)}`);
  }

  return entries[0];
}

async function applyBackground(payload, state, ui) {
  const image = resolveBackground(payload, state.scenario);
  const transitionId = ++state.transitionSerial;
  state.isTransitioning = true;
  ui.advanceButton.disabled = true;
  showSceneTransition(ui, state.scenario);
  playSceneTransitionSound(state.scenario);

  await Promise.all([preloadImage(image), wait(SCENE_TRANSITION_MIN_MS)]);

  if (state.transitionSerial !== transitionId) {
    return;
  }

  ui.background.style.backgroundImage = `url("${image}")`;
  await wait(SCENE_TRANSITION_SWAP_DELAY_MS);

  if (state.transitionSerial !== transitionId) {
    return;
  }

  hideSceneTransition(ui, state, { animate: true });
  await wait(SCENE_TRANSITION_OUTRO_MS);

  if (state.transitionSerial !== transitionId) {
    return;
  }

  state.isTransitioning = false;
}

function applyDate(payload, state, ui) {
  state.dateLabel = String(payload ?? "");
  ui.dateLabel.textContent = state.dateLabel || "--月--日";
}

function applyShow(payload, state, ui) {
  if (!payload || typeof payload !== "object") {
    throw new Error("show はオブジェクトで記述してください。");
  }

  const position = payload.position ?? "center";

  if (!POSITIONS.includes(position)) {
    throw new Error(`show.position は ${POSITIONS.join(", ")} のいずれかです。`);
  }

  const motionName = ensureMotionName(payload.motion);
  const sprite = {
    key: `${payload.character}:${payload.expression ?? "default"}:${++state.spriteSerial}`,
    position,
    characterId: payload.character,
    src: resolveCharacterSprite(payload, state.scenario),
    alt: resolveCharacterName(payload.character, state.scenario),
    enter: resolveEnterVariant(payload.enter, position),
    motionName,
    motionNonce: motionName ? ++state.motionSerial : 0
  };

  state.sprites[position] = sprite;
  renderSprites(ui, state);
  syncSpeakerBadgePosition(state, ui);
}

function applyHide(payload, state, ui) {
  if (typeof payload === "string") {
    delete state.sprites[payload];
    renderSprites(ui, state);
    syncSpeakerBadgePosition(state, ui);
    return;
  }

  if (payload?.position) {
    delete state.sprites[payload.position];
  } else if (payload?.character) {
    const match = Object.entries(state.sprites).find(([, sprite]) => sprite.characterId === payload.character);

    if (match) {
      delete state.sprites[match[0]];
    }
  } else {
    state.sprites = {};
  }

  renderSprites(ui, state);
  syncSpeakerBadgePosition(state, ui);
}

function applyMotion(payload, state, ui) {
  let motionName = null;
  let position = null;

  if (typeof payload === "string") {
    motionName = payload;
    position = findSpritePositionByCharacter(state.lastSpeakerCharacterId, state);
  } else if (payload && typeof payload === "object") {
    motionName = payload.name ?? payload.motion ?? payload.effect;

    if (payload.position) {
      position = payload.position;
    } else if (payload.character) {
      position = findSpritePositionByCharacter(payload.character, state);
    } else if (payload.target) {
      position = findSpritePositionByTarget(payload.target, state);
    } else {
      position = findSpritePositionByCharacter(state.lastSpeakerCharacterId, state);
    }
  }

  const normalizedMotion = ensureMotionName(motionName);

  if (!normalizedMotion) {
    throw new Error("motion.name にアニメーション名を指定してください。例: 衝撃, 疑問");
  }

  if (
    !position &&
    state.lastSpeakerPosition &&
    state.lastSpeakerPosition !== "narration" &&
    state.sprites[state.lastSpeakerPosition]?.characterId === state.lastSpeakerCharacterId
  ) {
    position = state.lastSpeakerPosition;
  }

  if (!position || !state.sprites[position]) {
    console.warn("[MOTION] 対象キャラクターが現在ステージ上にいないため、モーションをスキップしました。", {
      payload,
      currentNodeId: state.currentNodeId,
      lastSpeakerCharacterId: state.lastSpeakerCharacterId,
      lastSpeakerPosition: state.lastSpeakerPosition
    });
    return;
  }

  state.sprites[position].motionName = normalizedMotion;
  state.sprites[position].motionNonce = ++state.motionSerial;
  renderSprites(ui, state);
}

function applySay(payload, state, ui) {
  if (!payload || typeof payload !== "object") {
    throw new Error("say は `speaker` と `text` を持つオブジェクトで記述してください。");
  }

  const speaker = resolveSpeaker(payload.speaker, state);
  state.lastSpeakerLabel = speaker.label;
  state.lastSpeakerCharacterId = speaker.characterId;
  state.lastSpeakerPosition = speaker.position;
  renderSpeakerBadge(ui, speaker.label, speaker.position, speaker.characterId);
  const text = interpolateText(String(payload.text ?? ""), state.variables);
  appendBacklogEntry(state, {
    speaker: payload.speaker ? speaker.label : "",
    text
  });
  startTypewriter(text, ui, state);
  ui.advanceButton.disabled = false;
}

function applyChoice(payload, state, ui, api) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.options)) {
    throw new Error("choice.options は配列である必要があります。");
  }

  const options = payload.options.filter((option) => isChoiceVisible(option, state.variables));

  if (!options.length) {
    throw new Error(`choice に表示可能な選択肢がありません。 node: ${state.currentNodeId}`);
  }

  state.waitingForChoice = true;
  ui.advanceButton.disabled = true;
  ui.choices.hidden = false;
  ui.choices.innerHTML = "";

  for (const option of options) {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    const optionText = interpolateText(String(option.text ?? ""), state.variables);
    button.textContent = optionText;
    button.addEventListener("click", () => {
      state.waitingForChoice = false;
      clearChoices(ui);
      appendBacklogEntry(state, {
        speaker: getByPath(state.variables, "player.name") ?? "あなた",
        text: optionText,
        isChoice: true
      });

      if (option.set) {
        applySet(option.set, state);
      }

      if (option.goto) {
        jumpToNode(option.goto, state, ui);
      } else {
        renderError(ui, "choice の各 option には goto を指定してください。");
        return;
      }

      api.advance();
    });
    ui.choices.append(button);
  }
}

function applyBgm(payload, state) {
  const id = typeof payload === "string" ? payload : payload?.id;

  if (!id || id === "stop") {
    bgmPlayer.stop();
    return;
  }

  const src = resolveBgm(id, state.scenario);

  if (!src) {
    console.warn(`[BGM] "${id}" がマニフェストに見つかりません。assets/bgm/${id}.* を配置してください。`);
    return;
  }

  const loop = payload?.loop ?? true;
  const volume = payload?.volume ?? 0.75;
  bgmPlayer.play(toAppUrl(src), id, { loop, volume });
}

function resolveBgm(id, scenario) {
  return scenario.bgm?.[id] ?? scenario.assetManifest?.bgm?.[id] ?? null;
}

function applySound(payload, state) {
  const id = typeof payload === "string" ? payload : payload?.id;

  if (!id || id === "stop") {
    soundPlayer.stop();
    return;
  }

  const src = resolveSound(id, state.scenario);

  if (!src) {
    console.warn(`[SOUND] "${id}" がマニフェストに見つかりません。assets/sound/${id}.* を配置してください。`);
    return;
  }

  const loop = payload?.loop ?? false;
  const volume = payload?.volume ?? 1;
  soundPlayer.play(toAppUrl(src), { loop, volume });
}

function resolveSound(id, scenario) {
  return scenario.sound?.[id] ?? scenario.assetManifest?.sound?.[id] ?? null;
}

function playSceneTransitionSound(scenario) {
  const src = resolveSound(SCENE_TRANSITION_SOUND_ID, scenario) ?? `assets/sound/${SCENE_TRANSITION_SOUND_ID}.wav`;
  soundPlayer.play(toAppUrl(src), { volume: 0.8, loop: false });
}

function applySet(payload, state) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("set はオブジェクトで記述してください。");
  }

  for (const [path, value] of Object.entries(payload)) {
    setByPath(state.variables, path, value);
  }
}

function applyIf(payload, state, ui) {
  if (!payload || typeof payload !== "object") {
    throw new Error("if はオブジェクトで記述してください。");
  }

  const matched = evaluateCondition(payload.condition, state.variables);
  const target = matched ? payload.then : payload.else;

  if (!target) {
    stepNext(state, ui);
    return;
  }

  jumpToNode(target, state, ui);
}

function jumpToNode(target, state, ui) {
  if (typeof target !== "string") {
    throw new Error("goto / if.then / if.else にはノード名の文字列を指定してください。");
  }

  if (!Array.isArray(state.scenario.nodes[target])) {
    throw new Error(`遷移先ノード \`${target}\` が存在しません。`);
  }

  state.currentNodeId = target;
  state.actionIndex = 0;
  renderNodeIndicator(ui, state);
}

function stepNext(state, ui) {
  state.actionIndex += 1;
  renderNodeIndicator(ui, state);
}

function renderNodeIndicator(ui, state) {
  ui.nodeIndicator.textContent = `node: ${state.currentNodeId}`;
}

function renderSprites(ui, state) {
  const existing = new Map(
    Array.from(ui.spriteLayer.querySelectorAll(".sprite")).map((element) => [element.dataset.slot, element])
  );

  for (const position of POSITIONS) {
    const sprite = state.sprites[position];
    const currentElement = existing.get(position);

    if (!sprite) {
      if (currentElement) {
        removeSpriteElement(currentElement);
      }

      continue;
    }

    if (!currentElement) {
      const element = createSpriteElement(sprite);
      ui.spriteLayer.append(element);
      animateSpriteIn(element, sprite);
      continue;
    }

    if (currentElement.dataset.spriteKey !== sprite.key) {
      removeSpriteElement(currentElement);
      const element = createSpriteElement(sprite);
      ui.spriteLayer.append(element);
      animateSpriteIn(element, sprite);
      continue;
    }

    syncSpriteMotion(currentElement, sprite);
  }
}

function createSpriteElement(sprite) {
  const figure = document.createElement("figure");
  figure.className = "sprite";
  figure.dataset.slot = sprite.position;
  figure.dataset.position = sprite.position;
  figure.dataset.enter = sprite.enter;
  figure.dataset.spriteKey = sprite.key;
  figure.dataset.motionNonce = "0";

  const image = document.createElement("img");
  image.className = "sprite-image";
  image.src = sprite.src;
  image.alt = sprite.alt;

  const reaction = document.createElement("span");
  reaction.className = "sprite-reaction";
  reaction.setAttribute("aria-hidden", "true");

  figure.append(image, reaction);
  return figure;
}

function animateSpriteIn(element, sprite) {
  requestAnimationFrame(() => {
    element.classList.add("is-visible");
    syncSpriteMotion(element, sprite);
  });
}

function removeSpriteElement(element) {
  if (element.dataset.removing === "true") {
    return;
  }

  element.dataset.removing = "true";
  element.classList.remove("is-visible");
  element.classList.add("is-leaving");

  window.setTimeout(() => {
    if (element.isConnected) {
      element.remove();
    }
  }, 420);
}

function syncSpriteMotion(element, sprite) {
  if (!sprite.motionName || !sprite.motionNonce) {
    return;
  }

  const currentNonce = Number(element.dataset.motionNonce ?? "0");

  if (currentNonce === sprite.motionNonce) {
    return;
  }

  playSpriteMotion(element, sprite.motionName, sprite.motionNonce);
}

function playSpriteMotion(element, motionName, motionNonce) {
  const motion = resolveMotionDefinition(motionName);

  if (!motion) {
    return;
  }

  for (const item of Object.values(MOTION_LIBRARY)) {
    element.classList.remove(item.className);
  }

  clearTimeout(Number(element.dataset.motionTimerId || "0"));
  element.dataset.motionNonce = String(motionNonce);
  element.dataset.reaction = motion.reaction;

  const reaction = element.querySelector(".sprite-reaction");
  if (reaction) {
    reaction.textContent = motion.reaction;
  }

  void element.offsetWidth;
  element.classList.add(motion.className);

  const timerId = window.setTimeout(() => {
    element.classList.remove(motion.className);
    delete element.dataset.reaction;
  }, motion.durationMs);

  element.dataset.motionTimerId = String(timerId);
}

function clearChoices(ui) {
  ui.choices.hidden = true;
  ui.choices.innerHTML = "";
}

function showSceneTransition(ui, scenario) {
  ui.sceneTransitionLogo.src = toAppUrl(SCENE_TRANSITION_LOGO_PATH);
  ui.sceneTransitionLogo.hidden = !shouldShowSceneTransitionLogo(scenario);
  ui.sceneTransition.hidden = false;
  ui.sceneTransition.classList.add("is-visible");
  ui.sceneTransition.classList.remove("is-leaving");
}

function hideSceneTransition(ui, state, options = {}) {
  state.isTransitioning = false;

  if (!options.animate) {
    ui.sceneTransition.hidden = true;
    ui.sceneTransition.classList.remove("is-visible", "is-leaving");
    return;
  }

  ui.sceneTransition.classList.remove("is-visible");
  ui.sceneTransition.classList.add("is-leaving");
  window.setTimeout(() => {
    if (!ui.sceneTransition.classList.contains("is-visible")) {
      ui.sceneTransition.hidden = true;
      ui.sceneTransition.classList.remove("is-leaving");
    }
  }, SCENE_TRANSITION_OUTRO_MS);
}

function shouldShowSceneTransitionLogo(scenario) {
  const title = String(scenario?.title ?? "");
  return title.includes("風見塔のラストノート");
}

function renderSpeakerBadge(ui, label, position, characterId) {
  const isNarration = label === "Narration" || label === "System";
  ui.speaker.hidden = isNarration;
  ui.speaker.textContent = label;
  ui.speaker.dataset.position = position ?? "narration";
  ui.speaker.dataset.character = characterId ?? "";
}

function startTypewriter(text, ui, state) {
  cancelTypewriter(state);
  state.typingFullText = text;
  state.typing = true;
  ui.message.textContent = "";
  let index = 0;

  function tick() {
    index++;
    ui.message.textContent = text.slice(0, index);

    if (index >= text.length) {
      state.typing = false;
      state.typingTimer = null;
      return;
    }

    state.typingTimer = setTimeout(tick, 35);
  }

  tick();
}

function cancelTypewriter(state) {
  if (state.typingTimer !== null) {
    clearTimeout(state.typingTimer);
    state.typingTimer = null;
  }
}

function completeTypewriter(ui, state) {
  cancelTypewriter(state);
  ui.message.textContent = state.typingFullText;
  state.typing = false;
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`背景画像の読み込みに失敗しました: ${src}`));
    image.src = src;
  });
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function syncSpeakerBadgePosition(state, ui) {
  if (!state.lastSpeakerCharacterId) {
    return;
  }

  const position = findSpritePositionByCharacter(state.lastSpeakerCharacterId, state) ?? "narration";
  state.lastSpeakerPosition = position;
  renderSpeakerBadge(ui, state.lastSpeakerLabel, position, state.lastSpeakerCharacterId);
}

function resolveSpeaker(speaker, state) {
  if (!speaker) {
    return {
      label: "Narration",
      position: "narration",
      characterId: null
    };
  }

  if (speaker === "player" || speaker === "$player") {
    return {
      label: getByPath(state.variables, "player.name") ?? "あなた",
      position: "narration",
      characterId: null
    };
  }

  const rawSpeaker = String(speaker);
  const interpolated = interpolateText(rawSpeaker, state.variables);

  if (interpolated !== rawSpeaker || rawSpeaker.includes("{{")) {
    return {
      label: interpolated,
      position: "narration",
      characterId: null
    };
  }

  return {
    label: resolveCharacterName(rawSpeaker, state.scenario),
    position: findSpritePositionByCharacter(rawSpeaker, state) ?? "narration",
    characterId: rawSpeaker
  };
}

function renderError(ui, message) {
  if (!message) {
    ui.error.hidden = true;
    ui.error.textContent = "";
    return;
  }

  ui.error.hidden = false;
  ui.error.textContent = message;
}

function appendBacklogEntry(state, entry) {
  const text = String(entry?.text ?? "").trim();

  if (!text) {
    return;
  }

  state.backlog.push({
    speaker: String(entry?.speaker ?? "").trim(),
    text,
    isChoice: Boolean(entry?.isChoice)
  });

  if (state.backlog.length > BACKLOG_LIMIT) {
    state.backlog.splice(0, state.backlog.length - BACKLOG_LIMIT);
  }
}

function openBacklog(ui, state) {
  renderBacklog(ui, state);
  state.backlogOpen = true;
  ui.backlogPanel.hidden = false;
  ui.backlogButton.setAttribute("aria-expanded", "true");
}

function closeBacklog(ui, state) {
  state.backlogOpen = false;
  ui.backlogPanel.hidden = true;
  ui.backlogButton.setAttribute("aria-expanded", "false");
}

function renderBacklog(ui, state) {
  ui.backlogList.innerHTML = "";

  if (!state.backlog.length) {
    const empty = document.createElement("p");
    empty.className = "backlog-empty";
    empty.textContent = "履歴はまだありません。";
    ui.backlogList.append(empty);
    return;
  }

  for (const entry of state.backlog) {
    const article = document.createElement("article");
    article.className = "backlog-entry";

    if (entry.isChoice) {
      article.dataset.kind = "choice";
    } else if (!entry.speaker) {
      article.dataset.kind = "narration";
    }

    if (entry.speaker) {
      const speaker = document.createElement("div");
      speaker.className = "backlog-speaker";
      speaker.textContent = entry.speaker;
      article.append(speaker);
    }

    const text = document.createElement("p");
    text.className = "backlog-text";
    text.textContent = entry.text;
    article.append(text);
    ui.backlogList.append(article);
  }

  ui.backlogList.scrollTop = ui.backlogList.scrollHeight;
}

function resolveBackground(payload, scenario) {
  if (typeof payload === "string") {
    return toAppUrl(scenario.backgrounds?.[payload] ?? scenario.assetManifest?.backgrounds?.[payload] ?? payload);
  }

  if (payload?.image) {
    return toAppUrl(payload.image);
  }

  if (payload?.id) {
    return toAppUrl(scenario.backgrounds?.[payload.id] ?? scenario.assetManifest?.backgrounds?.[payload.id] ?? payload.id);
  }

  throw new Error("background は背景IDか image を指定してください。背景IDは public/assets/backgrounds/<id>.* から自動解決されます。");
}

function resolveCharacterSprite(payload, scenario) {
  if (!payload || typeof payload !== "object") {
    throw new Error("show はオブジェクトで記述してください。");
  }

  if (payload.image) {
    return toAppUrl(payload.image);
  }

  const character = scenario.characters?.[payload.character];
  const expression = normalizeExpressionName(payload.expression);
  const sprites = character?.sprites ?? scenario.assetManifest?.characters?.[payload.character] ?? {};
  const sprite = sprites[expression] ?? sprites.default;

  if (!sprite) {
    throw new Error(
      [
        `character \`${payload.character}\` に expression \`${expression}\` も default もありません。`,
        "命名規則:",
        "- public/assets/characters/<character>-<expression>.*",
        "- public/assets/characters/<character>/<expression>.*"
      ].join("\n")
    );
  }

  if (expression !== "default" && !sprites[expression] && sprites.default) {
    console.warn(
      `[SPRITE] ${payload.character} の expression "${expression}" がないため default にフォールバックしました。`
    );
  }

  return toAppUrl(sprite);
}

function normalizeExpressionName(value) {
  if (value === undefined || value === null || value === "") {
    return "default";
  }

  const expression = String(value).trim();
  if (!expression) {
    return "default";
  }

  return EXPRESSION_ALIASES[expression.toLowerCase?.() ?? expression] ?? EXPRESSION_ALIASES[expression] ?? expression;
}

function resolveCharacterName(characterId, scenario) {
  const character = scenario.characters?.[characterId];
  return character?.name ?? characterId ?? "Unknown";
}

function resolveEnterVariant(value, position) {
  if (value === undefined || value === null || value === "" || value === "auto") {
    if (position === "left") {
      return "left";
    }

    if (position === "right") {
      return "right";
    }

    return "center";
  }

  const variant = String(value);

  if (!ENTER_VARIANTS.has(variant)) {
    throw new Error(`show.enter は ${Array.from(ENTER_VARIANTS).join(", ")} のいずれかです。`);
  }

  return variant;
}

function normalizeMotionName(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const motion = String(value).trim();

  if (MOTION_LIBRARY[motion]) {
    return motion;
  }

  const alias = MOTION_ALIASES[motion.toLowerCase()];
  return alias ?? motion;
}

function ensureMotionName(value) {
  const motionName = normalizeMotionName(value);

  if (!motionName) {
    return null;
  }

  if (!MOTION_LIBRARY[motionName]) {
    throw new Error(`未対応のモーションです: ${value}`);
  }

  return motionName;
}

function resolveMotionDefinition(value) {
  const motionName = normalizeMotionName(value);
  return motionName ? MOTION_LIBRARY[motionName] ?? null : null;
}

function findSpritePositionByCharacter(characterId, state) {
  if (!characterId) {
    return null;
  }

  const entry = Object.entries(state.sprites).find(([, sprite]) => sprite.characterId === characterId);
  return entry?.[0] ?? null;
}

function findSpritePositionByTarget(target, state) {
  if (!target) {
    return null;
  }

  if (POSITIONS.includes(target)) {
    return target;
  }

  return findSpritePositionByCharacter(target, state);
}

function isChoiceVisible(option, variables) {
  if (!option.condition) {
    return true;
  }

  return evaluateCondition(option.condition, variables);
}

function evaluateCondition(condition, variables) {
  if (condition === undefined || condition === null || condition === "") {
    return true;
  }

  if (typeof condition === "boolean") {
    return condition;
  }

  if (typeof condition !== "string") {
    throw new Error("condition は文字列または boolean を指定してください。");
  }

  const trimmed = condition.trim();
  const pattern = /^([a-zA-Z0-9_.-]+)\s*(==|!=|>=|<=|>|<)?\s*(.*)$/;
  const match = trimmed.match(pattern);

  if (!match) {
    throw new Error(`condition を解釈できません: ${condition}`);
  }

  const [, leftPath, operator, rawRight] = match;
  const left = getByPath(variables, leftPath);

  if (!operator) {
    return Boolean(left);
  }

  const right = parseConditionValue(rawRight.trim(), variables);

  switch (operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      throw new Error(`未対応の比較演算子です: ${operator}`);
  }
}

function interpolateText(text, variables) {
  return String(text ?? "").replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (full, path) => {
    const value = getByPath(variables, path);
    return value === undefined || value === null ? full : String(value);
  });
}

function toAppUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }

  if (/^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:")) {
    return value;
  }

  if (value.startsWith("./") || value.startsWith("../")) {
    return value;
  }

  const baseUrl = import.meta.env.BASE_URL || "/";

  if (value.startsWith("/")) {
    return `${baseUrl.replace(/\/$/, "")}${value}`;
  }

  return `${baseUrl}${value.replace(/^\//, "")}`;
}

function parseConditionValue(value, variables) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (value === "null") {
    return null;
  }

  if (value === "") {
    return "";
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  if (!Number.isNaN(Number(value))) {
    return Number(value);
  }

  return getByPath(variables, value);
}

function getByPath(source, path) {
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function setByPath(target, path, value) {
  const keys = path.split(".");
  const lastKey = keys.pop();
  let current = target;

  for (const key of keys) {
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }

    current = current[key];
  }

  current[lastKey] = value;
}

function openPlayerSetup(ui, state) {
  const config = state.playerConfig;

  if (!config) {
    closePlayerSetup(ui);
    return;
  }

  ui.playerTitle.textContent = config.title;
  ui.playerCopy.textContent = config.prompt;
  ui.playerLabel.textContent = config.label;
  ui.playerInput.placeholder = config.placeholder;
  ui.playerInput.value = getByPath(state.variables, "player.name") ?? config.defaultName;
  ui.playerSubmit.textContent = config.confirmLabel;
  ui.playerPresets.innerHTML = config.presets
    .map((preset) => `<button class="player-preset" type="button" data-player-preset="${escapeHtml(preset)}">${escapeHtml(preset)}</button>`)
    .join("");
  ui.playerSetup.hidden = false;

  requestAnimationFrame(() => {
    ui.playerInput.focus();
    ui.playerInput.select();
  });
}

function closePlayerSetup(ui) {
  ui.playerSetup.hidden = true;
}

async function openPicker(ui, engine) {
  ui.scenarioPicker.hidden = false;
  ui.pickerClose.hidden = !engine.isLoaded();
  ui.pickerList.innerHTML = '<p class="picker-loading">読み込み中…</p>';

  try {
    const response = await fetch(toAppUrl("scenarios/index.json"), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(String(response.status));
    }

    const list = await response.json();
    ui.pickerList.innerHTML = "";

    for (const entry of list) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "picker-item";
      button.innerHTML = `
        <span class="picker-item-title">${escapeHtml(entry.title)}</span>
        ${entry.description ? `<span class="picker-item-desc">${escapeHtml(entry.description)}</span>` : ""}
      `;
      button.addEventListener("click", () => {
        closePicker(ui);
        engine.load(toAppUrl(entry.url));
      });
      ui.pickerList.append(button);
    }
  } catch (error) {
    ui.pickerList.innerHTML = `<p class="picker-error">シナリオ一覧を読み込めませんでした。(${escapeHtml(error.message)})</p>`;
  }
}

function closePicker(ui) {
  ui.scenarioPicker.hidden = true;
}

function toggleVolumePanel(ui) {
  const isOpen = ui.volumePanel.hidden;
  ui.volumePanel.hidden = !isOpen;
  ui.volumeButton.setAttribute("aria-expanded", String(isOpen));
}

function syncVolumeControl(slider, valueLabel, value) {
  const normalized = String(Math.round(Number(value) || 0));
  slider.value = normalized;
  valueLabel.textContent = `${normalized}%`;
}

function normalizeVolume(value, fallback = 1) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function loadVolumePreference(storageKey, fallback) {
  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (rawValue === null) {
      return fallback;
    }

    return normalizeVolume(Number(rawValue), fallback);
  } catch {
    return fallback;
  }
}

function saveVolumePreference(storageKey, value, fallback) {
  try {
    window.localStorage.setItem(storageKey, String(normalizeVolume(value, fallback)));
  } catch {}
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
