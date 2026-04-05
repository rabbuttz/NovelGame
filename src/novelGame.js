import { parse } from "yaml";

const DEFAULT_SCENARIO_URL = toAppUrl("scenarios/chapter1.yaml");
const POSITIONS = ["left", "center", "right"];

export function createGame(root) {
  root.innerHTML = `
    <main class="novel-app">
      <div class="background-layer" data-background></div>
      <section class="stage">
        <header class="top-bar">
          <div class="date-ribbon" data-date-label>--月--日</div>
          <div class="story-meta">
            <div class="scenario-tag" data-title>Loading</div>
            <div class="node-indicator" data-node-indicator>node: -</div>
          </div>
        </header>
        <div class="sprite-layer" data-sprite-layer></div>
        <section class="hud">
          <div class="choices" data-choices hidden></div>
          <div class="dialog-shell">
            <div class="speaker-badge" data-speaker>System</div>
            <div class="text-box">
              <p class="message" data-message>シナリオを読み込んでいます。</p>
            </div>
            <button class="advance-button" type="button" aria-label="次へ" data-advance></button>
          </div>
          <div class="command-bar">
            <button class="command-button" type="button" data-command="restart" data-clickable="true">
              <span class="command-icon">R</span>
              <span class="command-label">最初から</span>
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
            <button class="command-button" type="button" data-command="backlog">
              <span class="command-icon">B</span>
              <span class="command-label">Backlog</span>
            </button>
            <button class="command-button" type="button" data-command="menu">
              <span class="command-icon">M</span>
              <span class="command-label">Menu</span>
            </button>
          </div>
        </section>
      </section>
      <aside class="error-box" data-error hidden></aside>
    </main>
  `;

  const ui = getUi(root);
  const engine = createEngine(ui);

  ui.advanceButton.addEventListener("click", () => engine.advance());
  ui.restartButton.addEventListener("click", () => engine.restart());

  engine.load(DEFAULT_SCENARIO_URL);
}

function getUi(root) {
  return {
    root,
    background: root.querySelector("[data-background]"),
    spriteLayer: root.querySelector("[data-sprite-layer]"),
    dateLabel: root.querySelector("[data-date-label]"),
    title: root.querySelector("[data-title]"),
    nodeIndicator: root.querySelector("[data-node-indicator]"),
    speaker: root.querySelector("[data-speaker]"),
    message: root.querySelector("[data-message]"),
    choices: root.querySelector("[data-choices]"),
    advanceButton: root.querySelector("[data-advance]"),
    restartButton: root.querySelector('[data-command="restart"]'),
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
    ended: false
  };

  const api = {
    async load(url) {
      try {
        const scenario = await loadScenario(url);
        prepareScenario(state, scenario);
        renderShell(ui, state);
        api.advance();
      } catch (error) {
        renderError(ui, formatError(error));
      }
    },

    advance() {
      if (!state.scenario || state.waitingForChoice || state.ended) {
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

      prepareScenario(state, state.scenario);
      renderShell(ui, state);
      api.advance();
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
    characters: {}
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

function prepareScenario(state, scenario) {
  state.scenario = scenario;
  state.variables = structuredClone(scenario.variables ?? {});
  state.currentNodeId = scenario.start;
  state.actionIndex = 0;
  state.sprites = {};
  state.dateLabel = scenario.dateLabel ?? scenario.ui?.dateLabel ?? "";
  state.waitingForChoice = false;
  state.ended = false;
}

function renderShell(ui, state) {
  ui.title.textContent = state.scenario.title ?? "Novel Flow";
  ui.dateLabel.textContent = state.dateLabel || "--月--日";
  ui.background.style.backgroundImage = "";
  ui.speaker.textContent = "System";
  ui.message.textContent = "開始します。";
  ui.advanceButton.disabled = false;
  renderNodeIndicator(ui, state);
  renderSprites(ui, state);
  clearChoices(ui);
  renderError(ui, "");
}

function runUntilPause(state, ui, api) {
  while (!state.waitingForChoice && !state.ended) {
    const action = getCurrentAction(state);

    if (!action) {
      state.ended = true;
      ui.speaker.textContent = "System";
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
      applyBackground(payload, state, ui);
      stepNext(state, ui);
      return false;
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
    case "say":
      applySay(payload, state, ui);
      stepNext(state, ui);
      return true;
    case "choice":
      applyChoice(payload, state, ui, api);
      stepNext(state, ui);
      return true;
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

function applyBackground(payload, state, ui) {
  const image = resolveBackground(payload, state.scenario);
  ui.background.style.backgroundImage = `url("${image}")`;
}

function applyDate(payload, state, ui) {
  state.dateLabel = String(payload ?? "");
  ui.dateLabel.textContent = state.dateLabel || "--月--日";
}

function applyShow(payload, state, ui) {
  const position = payload.position ?? "center";

  if (!POSITIONS.includes(position)) {
    throw new Error(`show.position は ${POSITIONS.join(", ")} のいずれかです。`);
  }

  state.sprites[position] = {
    position,
    src: resolveCharacterSprite(payload, state.scenario),
    alt: resolveCharacterName(payload.character, state.scenario)
  };

  renderSprites(ui, state);
}

function applyHide(payload, state, ui) {
  if (typeof payload === "string") {
    delete state.sprites[payload];
    renderSprites(ui, state);
    return;
  }

  if (payload.position) {
    delete state.sprites[payload.position];
  } else if (payload.character) {
    const match = Object.entries(state.sprites).find(([, sprite]) => sprite.alt === resolveCharacterName(payload.character, state.scenario));

    if (match) {
      delete state.sprites[match[0]];
    }
  } else {
    state.sprites = {};
  }

  renderSprites(ui, state);
}

function applySay(payload, state, ui) {
  if (!payload || typeof payload !== "object") {
    throw new Error("say は `speaker` と `text` を持つオブジェクトで記述してください。");
  }

  ui.speaker.textContent = resolveSpeakerName(payload.speaker, state.scenario);
  ui.message.textContent = payload.text ?? "";
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
    button.textContent = option.text;
    button.addEventListener("click", () => {
      state.waitingForChoice = false;
      clearChoices(ui);

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
  ui.spriteLayer.innerHTML = "";

  for (const position of POSITIONS) {
    const sprite = state.sprites[position];

    if (!sprite) {
      continue;
    }

    const image = document.createElement("img");
    image.className = "sprite is-visible";
    image.dataset.position = sprite.position;
    image.src = sprite.src;
    image.alt = sprite.alt;
    ui.spriteLayer.append(image);
  }
}

function clearChoices(ui) {
  ui.choices.hidden = true;
  ui.choices.innerHTML = "";
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
  const expression = payload.expression ?? "default";
  const sprite =
    character?.sprites?.[expression] ??
    scenario.assetManifest?.characters?.[payload.character]?.[expression];

  if (!sprite) {
    throw new Error(
      [
        `character \`${payload.character}\` に expression \`${expression}\` がありません。`,
        "命名規則:",
        "- public/assets/characters/<character>-<expression>.*",
        "- public/assets/characters/<character>/<expression>.*"
      ].join("\n")
    );
  }

  return toAppUrl(sprite);
}

function resolveCharacterName(characterId, scenario) {
  const character = scenario.characters?.[characterId];
  return character?.name ?? characterId ?? "Unknown";
}

function resolveSpeakerName(speaker, scenario) {
  if (!speaker) {
    return "Narration";
  }

  return resolveCharacterName(speaker, scenario);
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

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
