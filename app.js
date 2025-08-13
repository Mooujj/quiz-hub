const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const app = $("#app");
$("#year") && ($("#year").textContent = new Date().getFullYear());

let QUIZZES = [];
let CURRENT = {
  quiz: null,
  index: 0,
  answers: [],
  checked: [],
  showSolution: [],
};

window.addEventListener("hashchange", route);
init();

async function init() {
  try {
    const res = await fetch("quizzes.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load quizzes.json (${res.status})`);
    const data = await res.json();
    QUIZZES = (data && data.quizzes) || [];
  } catch (e) {
    console.error(e);
    app.innerHTML = `
      <div class="result">
        <p>Couldn't load <code>quizzes.json</code>.</p>
        <small class="helper">Make sure it's next to <code>index.html</code> and valid JSON.</small>
      </div>`;
    return;
  }
  route();
}

function route() {
  const m = new URL(location.href);
  const id = m.hash.replace(/^#\/?quiz\//, "");
  if (!id) return renderLanding();
  const quiz = QUIZZES.find((q) => q.id === id);
  if (!quiz) return renderNotFound(id);
  startQuiz(quiz);
  renderQuiz();
}

function renderLanding() {
  document.title = "Quiz Hub";
  app.innerHTML = `
    <section>
      <h2>Choose a quiz</h2>
      <div class="grid" role="list">
        ${QUIZZES.map(
          (q) => `
          <article class="card" role="listitem">
            <h3>${escapeHTML(q.title)}</h3>
            <p>${escapeHTML(q.description || "")}</p>
            <div class="actions" style="margin-top:12px">
              <a class="btn" href="#/quiz/${encodeURIComponent(
                q.id
              )}" aria-label="Start ${escapeHTML(q.title)}">Start</a>
            </div>
          </article>
        `
        ).join("")}
      </div>
    </section>
  `;
}

function renderNotFound(id) {
  document.title = "Quiz not found";
  app.innerHTML = `
    <div class="result">
      <p>Quiz "<strong>${escapeHTML(id)}</strong>" not found.</p>
      <div class="actions" style="margin-top:10px">
        <a class="btn" href="./">Back to quizzes</a>
      </div>
    </div>
  `;
}

function qType(q) {
  return (q.type || "multiple-choice-single").toLowerCase();
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function normalizeTF(q) {
  const options =
    q.options && q.options.length === 2 ? q.options.slice() : ["True", "False"];
  let answerIndex;
  if (typeof q.answerIndex === "number") {
    answerIndex = q.answerIndex;
  } else if (typeof q.answer === "boolean") {
    const idxTrue = options.findIndex(
      (o) => String(o).trim().toLowerCase() === "true"
    );
    const idxFalse = options.findIndex(
      (o) => String(o).trim().toLowerCase() === "false"
    );
    answerIndex = q.answer
      ? idxTrue !== -1
        ? idxTrue
        : 0
      : idxFalse !== -1
      ? idxFalse
      : 1;
  } else {
    answerIndex = 0;
  }
  return { ...q, options, answerIndex };
}

function prepareRandomisedQuiz(quiz) {
  const orderQ = shuffle(quiz.questions.map((_, i) => i));
  const questions = orderQ.map((i) => {
    const raw = quiz.questions[i];
    const type = qType(raw);
    const base = type === "true-false" ? normalizeTF(raw) : { ...raw };

    const optIdx = shuffle(base.options.map((_, j) => j));
    const options = optIdx.map((j) => base.options[j]);

    if (type === "multiple-choice-multiple") {
      const src = Array.isArray(base.answerIndexes) ? base.answerIndexes : [];
      const mapped = src
        .map((ai) => optIdx.indexOf(ai))
        .filter((x) => x >= 0)
        .sort((a, b) => a - b);
      return { type, text: base.text, options, answerIndexes: mapped };
    }
    const newAns = optIdx.indexOf(base.answerIndex ?? 0);
    return { type, text: base.text, options, answerIndex: newAns };
  });

  return { ...quiz, questions };
}

function reshuffleQuestionAt(i) {
  const q = CURRENT.quiz.questions[i];
  const indices = shuffle(q.options.map((_, j) => j));
  const options = indices.map((j) => q.options[j]);
  if (q.type === "multiple-choice-multiple") {
    const mapped = (q.answerIndexes || [])
      .map((ai) => indices.indexOf(ai))
      .filter((x) => x >= 0)
      .sort((a, b) => a - b);
    CURRENT.quiz.questions[i] = { ...q, options, answerIndexes: mapped };
  } else {
    const newAns = indices.indexOf(q.answerIndex);
    CURRENT.quiz.questions[i] = { ...q, options, answerIndex: newAns };
  }
}

function startQuiz(quiz) {
  const randomized = prepareRandomisedQuiz(quiz);
  CURRENT.quiz = randomized;
  CURRENT.index = 0;
  CURRENT.answers = new Array(randomized.questions.length).fill(null);
  CURRENT.checked = new Array(randomized.questions.length).fill(false);
  CURRENT.showSolution = new Array(randomized.questions.length).fill(false);
  document.title = `${randomized.title} – Quiz Hub`;
}

function getUserAnswerFor(q, index) {
  const t = qType(q);
  if (t === "multiple-choice-multiple") {
    const sel = $$("#form input[type=checkbox]:checked")
      .map((x) => Number(x.value))
      .sort((a, b) => a - b);
    return sel;
  } else {
    const sel = $("#form input[type=radio]:checked");
    return sel ? Number(sel.value) : null;
  }
}
function isAnswered(val, q) {
  return Array.isArray(val)
    ? val.length > 0
    : val !== null && val !== undefined;
}
function isCorrect(q, user) {
  const t = qType(q);
  if (t === "multiple-choice-multiple") {
    const a = new Set(q.answerIndexes || []);
    const u = new Set(Array.isArray(user) ? user : []);
    if (a.size !== u.size) return false;
    for (const k of a) if (!u.has(k)) return false;
    return true;
  }
  return typeof user === "number" && user === q.answerIndex;
}

function firstUnanswered(quiz, answers) {
  for (let i = 0; i < quiz.questions.length; i++) {
    const v = answers[i];
    const answered = Array.isArray(v)
      ? v.length > 0
      : v !== null && v !== undefined;
    if (!answered) return i;
  }
  return -1;
}

function renderQuiz() {
  const { quiz, index, answers, checked, showSolution } = CURRENT;
  const total = quiz.questions.length;
  const q = quiz.questions[index];
  const type = (q.type || "multiple-choice-single").toLowerCase();
  const stored = answers[index];
  const wasChecked = checked[index] === true;
  const revealSolution = showSolution[index] === true;

  const allAnswered = answers.every((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined
  );
  const onLast = index === total - 1;

  app.innerHTML = `
    <section>
      <div class="quiz-header">
        <a class="btn secondary" href="./" aria-label="Back to quiz list">← Back</a>
        <h2 style="margin:0">${escapeHTML(quiz.title)}</h2>
        <span class="badge">${index + 1} / ${total}</span>
      </div>

      <div class="progress" aria-hidden="true"><span style="width:${
        (index / total) * 100
      }%"></span></div>

      <article class="question-card" aria-labelledby="q-${index}">
        <p id="q-${index}" class="question">${escapeHTML(q.text)}</p>

        <form id="form" class="options" aria-describedby="help-${index}">
          ${renderOptions(q, stored, { wasChecked, revealSolution })}
          <small id="help-${index}" class="helper">${
    type === "multiple-choice-multiple"
      ? "Select all that apply."
      : "Choose one option."
  }</small>
        </form>

        <div class="actions-split">
          <div class="left">
            <button class="btn" id="check">Check</button>
            ${
              wasChecked && !isCorrect(q, stored)
                ? `<button class="btn secondary" id="show">Show solution</button>`
                : ""
            }
            ${
              wasChecked && !isCorrect(q, stored)
                ? `<button class="btn secondary" id="retry">Retry</button>`
                : ""
            }
          </div>
          <div class="right">
            <button class="btn secondary" id="prev" ${
              index === 0 ? "disabled" : ""
            }>Previous</button>
            ${
              onLast
                ? allAnswered
                  ? `<button class="btn" id="finish">Finish</button>`
                  : ``
                : `<button class="btn" id="next">Next</button>`
            }
          </div>
        </div>
      </article>
    </section>
  `;

  if (wasChecked) $$("#form input").forEach((inp) => (inp.disabled = true));

  const updateAnswerFromForm = () => {
    if (type === "multiple-choice-multiple") {
      const sel = $$("#form input[type=checkbox]:checked")
        .map((x) => Number(x.value))
        .sort((a, b) => a - b);
      CURRENT.answers[index] = sel;
    } else {
      const sel = $("#form input[type=radio]:checked");
      CURRENT.answers[index] = sel ? Number(sel.value) : null;
    }
  };
  $$("#form input").forEach((inp) => {
    inp.addEventListener("change", () => {
      updateAnswerFromForm();
      if (onLast) renderQuiz();
    });
  });

  $("#check").addEventListener("click", (e) => {
    e.preventDefault();
    const user = getUserAnswerFor(q, index);
    if (Array.isArray(user) ? user.length === 0 : user == null) {
      alert("Please select an answer.");
      return;
    }
    CURRENT.answers[index] = user;
    CURRENT.checked[index] = true;
    CURRENT.showSolution[index] = false;
    renderQuiz();
  });

  $("#show") &&
    $("#show").addEventListener("click", (e) => {
      e.preventDefault();
      CURRENT.showSolution[index] = true;
      renderQuiz();
    });

  $("#retry") &&
    $("#retry").addEventListener("click", (e) => {
      e.preventDefault();
      reshuffleQuestionAt(index);
      CURRENT.answers[index] = type === "multiple-choice-multiple" ? [] : null;
      CURRENT.checked[index] = false;
      CURRENT.showSolution[index] = false;
      renderQuiz();
    });

  $("#prev").addEventListener("click", (e) => {
    e.preventDefault();
    if (CURRENT.index > 0) {
      CURRENT.index--;
      renderQuiz();
    }
  });

  $("#next") &&
    $("#next").addEventListener("click", (e) => {
      e.preventDefault();
      updateAnswerFromForm();
      if (index < total - 1) {
        CURRENT.index++;
      } else {
        const i = firstUnanswered(quiz, CURRENT.answers);
        if (i !== -1) CURRENT.index = i;
      }
      renderQuiz();
    });

  $("#finish") &&
    $("#finish").addEventListener("click", (e) => {
      e.preventDefault();
      renderResults();
    });
}

function renderOptions(question, stored, { wasChecked, revealSolution }) {
  const t = qType(question);
  const chosenSet = new Set(
    Array.isArray(stored) ? stored : stored != null ? [stored] : []
  );
  const correctSet = new Set(
    t === "multiple-choice-multiple"
      ? question.answerIndexes || []
      : [question.answerIndex]
  );

  return question.options
    .map((opt, i) => {
      const name = "q-" + Math.random().toString(36).slice(2, 8);
      const isSelected = chosenSet.has(i);
      const isCorrect = correctSet.has(i);

      let stateClass = "";
      let outline = "";
      if (wasChecked) {
        if (isSelected && isCorrect) {
          stateClass = "opt-correct";
          outline = "box-shadow: inset 0 0 0 2px #10b981; background:#0e2a1f;";
        } else if (isSelected && !isCorrect) {
          stateClass = "opt-wrong";
          outline = "box-shadow: inset 0 0 0 2px #ef4444; background:#2a0e10;";
        } else if (revealSolution && isCorrect) {
          outline = "box-shadow: inset 0 0 0 2px #10b981;";
        }
      }

      const control =
        t === "multiple-choice-multiple"
          ? `<input type="checkbox" name="${name}" value="${i}" ${
              isSelected ? "checked" : ""
            } ${wasChecked ? "disabled" : ""} />`
          : `<input type="radio" name="q-current" value="${i}" ${
              isSelected ? "checked" : ""
            } ${wasChecked ? "disabled" : ""} />`;

      return `
      <label class="option ${stateClass}" style="${outline}">
        ${control}
        <span>${escapeHTML(opt)}</span>
      </label>
    `;
    })
    .join("");
}

function renderResults() {
  const { quiz, answers } = CURRENT;
  let correct = 0;

  const lines = quiz.questions.map((q, i) => {
    const t = qType(q);
    const user = answers[i];

    let ok = false;
    let userStr = "";
    let correctStr = "";

    if (t === "multiple-choice-multiple") {
      const u = Array.isArray(user) ? user : [];
      const a = Array.isArray(q.answerIndexes) ? q.answerIndexes : [];
      ok = new Set(u).size === new Set(a).size && a.every((x) => u.includes(x));
      userStr = u.length
        ? u.map((k) => escapeHTML(q.options[k])).join(", ")
        : "<em>No answer</em>";
      correctStr = a.map((k) => escapeHTML(q.options[k])).join(", ");
    } else {
      const u = typeof user === "number" ? user : null;
      ok = u !== null && u === q.answerIndex;
      userStr = u !== null ? escapeHTML(q.options[u]) : "<em>No answer</em>";
      correctStr = escapeHTML(q.options[q.answerIndex]);
    }
    if (ok) correct++;

    return `
      <li style="margin:8px 0">
        <div><strong>${escapeHTML(q.text)}</strong></div>
        <div>Your answer: ${userStr}</div>
        <div>Correct answer: <strong>${correctStr}</strong></div>
        <div style="color:${ok ? "#10b981" : "#ef4444"};font-weight:700">${
      ok ? "Correct" : "Incorrect"
    }</div>
      </li>
    `;
  });

  const total = quiz.questions.length;
  const pct = Math.round((correct / total) * 100);

  app.innerHTML = `
    <section class="result">
      <h2>${escapeHTML(quiz.title)} – Results</h2>
      <p class="score">Score: ${correct} / ${total} (${pct}%)</p>

      <details style="margin:12px 0">
        <summary>Review answers</summary>
        <ol>${lines.join("")}</ol>
      </details>

      <div class="actions-split">
        <div class="left">
          <button class="btn" id="retry-quiz">Retry</button>
        </div>
        <div class="right">
          <a class="btn secondary" href="./">Back to quizzes</a>
        </div>
      </div>
    </section>
  `;

  document.getElementById("retry-quiz").addEventListener("click", (e) => {
    e.preventDefault();
    const original = QUIZZES.find((qz) => qz.id === CURRENT.quiz.id);
    if (!original) return;
    startQuiz(original);
    renderQuiz();
  });
}

function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
