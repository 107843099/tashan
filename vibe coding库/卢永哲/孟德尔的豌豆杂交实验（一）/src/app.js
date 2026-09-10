const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  mode: "learn",
  parents: [null, null],
  challengeLevel: 1,
  score: 0,
  question: null,
  selected: new Set(),
  submitted: false
};

let flowTimer = null;

const challengeData = {
  1: { hint: "基础配对", pairs: [["TT", "tt"], ["tt", "TT"]], possible: ["Tt"], prompt: "选出它们可能产生的全部子代。" },
  2: { hint: "显性表现", pairs: [["Tt", "Tt"]], possible: ["TT", "Tt", "tt"], prompt: "选出它们可能产生的全部子代。" },
  3: { hint: "测交挑战", pairs: [["Tt", "tt"], ["tt", "Tt"]], possible: ["Tt", "tt"], prompt: "选出它们可能产生的全部子代。" }
};

const knowledgeContent = $("#knowledgeContent");
const defaultKnowledgeHTML = knowledgeContent.innerHTML;
const heroStats = $("#heroStats");
const heroLearnIntro = $("#heroLearnIntro");
const exitModal = $("#exitModal");
const leaveLab = $("#leaveLab");

$("#enterLab").addEventListener("click", () => {
  $(".app").classList.remove("intro-active");
});

const introView = $("#introView");
const answerModal = $("#answerModal");
const showAnswers = $("#showAnswers");
const closeAnswers = $("#closeAnswers");

function closeAnswerModal() {
  answerModal.hidden = true;
  introView.classList.remove("answer-open");
  document.body.classList.remove("modal-open");
  showAnswers.focus();
}

showAnswers.addEventListener("click", () => {
  answerModal.hidden = false;
  introView.classList.add("answer-open");
  document.body.classList.add("modal-open");
  closeAnswers.focus();
});
closeAnswers.addEventListener("click", closeAnswerModal);
answerModal.querySelector("[data-close-answer]").addEventListener("click", closeAnswerModal);

function closeExitQuestion() {
  exitModal.hidden = true;
  document.body.classList.remove("modal-open");
  leaveLab.focus();
}

leaveLab.addEventListener("click", () => {
  exitModal.hidden = false;
  document.body.classList.add("modal-open");
  $("#closeExitQuestion").focus();
});
$("#closeExitQuestion").addEventListener("click", closeExitQuestion);
$("#returnToLab").addEventListener("click", closeExitQuestion);
exitModal.querySelector("[data-close-exit]").addEventListener("click", closeExitQuestion);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!answerModal.hidden) closeAnswerModal();
  else if (!exitModal.hidden) closeExitQuestion();
});

function phenotype(genotype) {
  return genotype.includes("T") ? "高茎" : "矮茎";
}

function canonical(genotype) {
  return genotype.split("").sort((a, b) => (a === b ? 0 : a === "T" ? -1 : 1)).join("");
}

function setMode(mode) {
  state.mode = mode;
  heroStats.hidden = mode !== "challenge";
  heroLearnIntro.hidden = mode !== "learn";
  $("#learnView").hidden = mode !== "learn";
  $("#challengeView").hidden = mode !== "challenge";
  $("#learnView").classList.toggle("active-view", mode === "learn");
  $("#challengeView").classList.toggle("active-view", mode === "challenge");
  $$(".mode-btn").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (mode === "challenge" && !state.question) newChallenge();
}

function updateFlow(stage) {
  $$(".flow-card").forEach((card, index) => card.classList.toggle("active", index === stage));
}

function clearFlowTimer() {
  if (flowTimer) {
    window.clearTimeout(flowTimer);
    flowTimer = null;
  }
}

function renderParentSlots() {
  const slots = $$(".parent-slot");
  slots.forEach((slot, index) => {
    const genotype = state.parents[index];
    const value = slot.querySelector(".slot-value");
    const plant = slot.querySelector(".slot-plant");
    slot.classList.toggle("filled", Boolean(genotype));
    value.textContent = genotype ? `${genotype} · ${phenotype(genotype)}` : "拖入基因型";
    const tall = genotype && phenotype(genotype) === "高茎";
    plant.textContent = genotype ? (tall ? "🌿" : "🌱") : "＋";
    plant.classList.toggle("tall", Boolean(tall));
    plant.classList.toggle("short", Boolean(genotype && !tall));
    slot.setAttribute("aria-label", `亲本 ${index === 0 ? "A" : "B"}${genotype ? `，${genotype}，${phenotype(genotype)}` : "，拖入基因型"}`);
  });
  $("#runExperiment").disabled = state.parents.some((parent) => !parent);
  const [first, second] = state.parents;
  $("#gameteNote").innerHTML = first && second
    ? `<span class="dot yellow"></span>亲本 A 可产生 <b>${[...first].join("、")}</b> 配子；亲本 B 可产生 <b>${[...second].join("、")}</b> 配子`
    : '<span class="dot yellow"></span>先放入两个亲本，系统会根据基因型生成配子';
}

function renderResultKnowledge(parentA, parentB, cells) {
  const counts = cells.reduce((result, genotype) => {
    result[genotype] = (result[genotype] || 0) + 1;
    return result;
  }, {});
  const genotypeSummary = ["TT", "Tt", "tt"].filter((genotype) => counts[genotype]).map((genotype) => `${genotype} × ${counts[genotype]}`).join("；");
  const high = cells.filter((genotype) => phenotype(genotype) === "高茎").length;
  const low = cells.length - high;
  const explanation = low === 0
    ? "本次没有形成 tt，所以所有子代都表现为高茎。"
    : high === 3 && low === 1
      ? "高茎占 3/4、矮茎占 1/4；只有 tt 同时带有两个隐性基因，才表现为矮茎。"
      : `本次有 ${high} 个高茎、${low} 个矮茎；表现型由子代的基因型共同决定。`;
  knowledgeContent.innerHTML = `<p class="knowledge-intro result-intro">本次实验：<b>${parentA} × ${parentB}</b></p>
    <div class="result-knowledge-item"><span>配子</span><p>亲本 A 提供 <b>${[...parentA].join("、")}</b>；亲本 B 提供 <b>${[...parentB].join("、")}</b>。</p></div>
    <div class="result-knowledge-item"><span>基因型</span><p>四个组合中：<b>${genotypeSummary}</b>。</p></div>
    <div class="result-knowledge-item"><span>性状</span><p>${explanation}</p></div>
    <div class="result-focus"><b>读图方法</b><small>先看格子里的两个字母，再判断它对应的高茎或矮茎。</small></div>`;
}

function clearExperimentOutput() {
  knowledgeContent.innerHTML = defaultKnowledgeHTML;
  $$(".cell").forEach((cell) => { cell.textContent = "?"; cell.classList.remove("filled"); });
  $$(".gamete.top, .gamete.side").forEach((header) => { header.textContent = header.classList.contains("top") ? "?" : "?"; });
  $("#squareStatus").textContent = "等待配子";
  $("#squareStatus").className = "status";
  $("#ratioBox").innerHTML = "<span>表现型比例</span><strong>—</strong><small>完成实验后查看</small>";
  $("#offspringGarden").innerHTML = '<span class="garden-placeholder">选择两个亲本后开始实验</span>';
  $("#learnMessage").innerHTML = '<span class="message-icon">i</span><p><b>小提示：</b>显性基因只要出现一份，性状就会表现出来；只有 <b>tt</b> 才会长成矮茎。</p>';
  updateFlow(state.parents.every(Boolean) ? 0 : -1);
}

function assignParent(slotIndex, genotype) {
  state.parents[slotIndex] = genotype;
  clearFlowTimer();
  clearExperimentOutput();
  renderParentSlots();
}

function runExperiment() {
  if (state.parents.some((parent) => !parent)) return;
  clearFlowTimer();
  updateFlow(1);
  const [parentA, parentB] = state.parents;
  const gametesA = [...parentA];
  const gametesB = [...parentB];
  const cells = gametesA.flatMap((alleleA) => gametesB.map((alleleB) => canonical(alleleA + alleleB)));
  $$(".cell").forEach((cell, index) => {
    cell.textContent = cells[index];
    cell.classList.add("filled");
  });
  $$(".gamete.side").forEach((header, index) => { header.textContent = gametesA[index]; });
  $$(".gamete.top").forEach((header, index) => { header.textContent = gametesB[index]; });
  const high = cells.filter((genotype) => phenotype(genotype) === "高茎").length;
  const low = cells.length - high;
  const divisor = [high, low].filter(Boolean).reduce((a, b) => { while (b) [a, b] = [b, a % b]; return a; }, 0) || 1;
  $("#squareStatus").textContent = "组合完成";
  $("#squareStatus").className = "status good";
  $("#ratioBox").innerHTML = `<span>表现型比例</span><strong>${high / divisor} : ${low / divisor}</strong><small>高茎 : 矮茎</small>`;
  $("#learnMessage").innerHTML = `<span class="message-icon">✓</span><p><b>实验结果：</b>4 个组合中有 ${high} 个高茎、${low} 个矮茎。${low ? "只有含有两个隐性基因的 tt 才表现为矮茎。" : "这次组合的子代全部表现为高茎。"}</p>`;
  renderResultKnowledge(parentA, parentB, cells);
  const garden = $("#offspringGarden");
  garden.innerHTML = "";
  cells.forEach((genotype, index) => {
    const child = document.createElement("div");
    child.className = `offspring ${phenotype(genotype) === "高茎" ? "tall" : "short"}`;
    child.style.animationDelay = `${index * 100}ms`;
    child.innerHTML = `<span class="plant">${phenotype(genotype) === "高茎" ? "🌿" : "🌱"}</span><small>${genotype} · ${phenotype(genotype)}</small>`;
    garden.append(child);
  });
  flowTimer = window.setTimeout(() => {
    updateFlow(2);
    flowTimer = null;
  }, 500);
}

function resetExperiment() {
  state.parents = [null, null];
  clearFlowTimer();
  clearExperimentOutput();
  renderParentSlots();
}

function randomQuestion(level) {
  const data = challengeData[level];
  const pair = data.pairs[Math.floor(Math.random() * data.pairs.length)];
  return { ...data, pair, choices: ["TT", "Tt", "tt"] };
}

function newChallenge() {
  state.question = randomQuestion(state.challengeLevel);
  state.selected = new Set();
  state.submitted = false;
  renderChallenge();
}

function renderChallenge() {
  const question = state.question;
  $("#heroProgress").textContent = `${state.challengeLevel} / 3`;
  $("#heroScore").textContent = state.score;
  $("#challengeScore").textContent = state.score;
  $("#levelBadge").textContent = `LEVEL ${state.challengeLevel}`;
  $("#levelHint").textContent = question.hint;
  $("#challengeParentA").textContent = question.pair[0];
  $("#challengeParentB").textContent = question.pair[1];
  $$(".challenge-parents .plant").forEach((plant, index) => {
    const tall = phenotype(question.pair[index]) === "高茎";
    plant.textContent = tall ? "🌿" : "🌱";
    plant.classList.toggle("tall", tall);
    plant.classList.toggle("short", !tall);
  });
  $("#challengePrompt").textContent = question.prompt;
  const grid = $("#answerGrid");
  grid.innerHTML = "";
  question.choices.forEach((genotype) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-card";
    button.dataset.genotype = genotype;
    button.setAttribute("aria-pressed", "false");
    const heightClass = phenotype(genotype) === "高茎" ? "tall" : "short";
    button.innerHTML = `<span class="plant ${heightClass}">${heightClass === "tall" ? "🌿" : "🌱"}</span><b>${genotype}</b><small>${phenotype(genotype)}</small>`;
    button.addEventListener("click", () => selectAnswer(genotype));
    grid.append(button);
  });
  $("#challengeFeedback").className = "feedback";
  $("#challengeFeedback").textContent = "";
  $("#submitAnswer").hidden = false;
  $("#nextLevel").hidden = true;
}

function selectAnswer(genotype) {
  if (state.submitted) return;
  if (state.selected.has(genotype)) state.selected.delete(genotype); else state.selected.add(genotype);
  $$(".answer-card").forEach((card) => {
    const selected = state.selected.has(card.dataset.genotype);
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
}

function submitAnswer() {
  if (state.submitted || state.selected.size === 0) return;
  state.submitted = true;
  const expected = new Set(state.question.possible);
  const correct = expected.size === state.selected.size && [...expected].every((value) => state.selected.has(value));
  $$(".answer-card").forEach((card) => {
    const genotype = card.dataset.genotype;
    if (expected.has(genotype)) card.classList.add("correct");
    else if (state.selected.has(genotype)) card.classList.add("wrong");
  });
  const feedback = $("#challengeFeedback");
  feedback.className = `feedback ${correct ? "good" : "bad"}`;
  if (correct) {
    state.score += 100;
    $("#heroScore").textContent = state.score;
    $("#challengeScore").textContent = state.score;
    feedback.textContent = state.challengeLevel === 3 ? "太棒了！你完成了全部基础关卡。" : `回答正确！${[...expected].join("、")} 都可能出现。`;
    $("#submitAnswer").hidden = true;
    $("#nextLevel").hidden = state.challengeLevel === 3;
  } else {
    feedback.textContent = `再想一想：${[...expected].join("、")} 才是全部可能的子代。看每个亲本能提供哪些配子。`;
    state.submitted = false;
  }
}

$("#runExperiment").addEventListener("click", runExperiment);
$("#resetExperiment").addEventListener("click", resetExperiment);
$$('.genotype-choice').forEach((choice) => {
  choice.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", choice.dataset.genotype));
  choice.addEventListener("click", () => {
    const firstEmpty = state.parents.findIndex((parent) => !parent);
    assignParent(firstEmpty === -1 ? 0 : firstEmpty, choice.dataset.genotype);
  });
});
$$('.parent-slot').forEach((slot) => {
  slot.addEventListener("dragover", (event) => event.preventDefault());
  slot.addEventListener("drop", (event) => {
    event.preventDefault();
    const genotype = event.dataTransfer.getData("text/plain");
    if (genotype) assignParent(Number(slot.dataset.slot), genotype);
  });
  slot.addEventListener("click", () => {
    if (state.parents[Number(slot.dataset.slot)]) assignParent(Number(slot.dataset.slot), null);
  });
});
renderParentSlots();
updateFlow(-1);
$("#submitAnswer").addEventListener("click", submitAnswer);
$("#nextLevel").addEventListener("click", () => { state.challengeLevel += 1; newChallenge(); });
$$('.mode-btn').forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
