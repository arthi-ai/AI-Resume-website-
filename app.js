/* ============================================================
   0 to Shipped — Resume Parser (fully client-side mock)
   pdf.js extracts the text in the browser; a keyword dictionary
   produces the score, present skills and missing skills.
   ============================================================ */

// Match the version loaded in index.html
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/* ---------- 1. The skill dictionary ----------------------- */
/* Weight = how much each skill counts toward the score.      */

const SKILL_GROUPS = [
  {
    name: "Languages",
    weight: 3,
    skills: ["Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "PHP", "Ruby", "Kotlin", "Swift", "SQL", "Bash"],
  },
  {
    name: "Frontend",
    weight: 3,
    skills: ["React", "Next.js", "Vue", "Angular", "Svelte", "HTML", "CSS", "Tailwind", "Redux", "Bootstrap"],
  },
  {
    name: "Backend & APIs",
    weight: 3,
    skills: ["Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", "Rails", "Laravel", "GraphQL", "REST API", "Microservices"],
  },
  {
    name: "Databases",
    weight: 2,
    skills: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite", "Firebase", "DynamoDB", "Elasticsearch"],
  },
  {
    name: "Cloud & DevOps",
    weight: 2,
    skills: ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "CI/CD", "Jenkins", "Terraform", "Linux", "Nginx"],
  },
  {
    name: "Data & AI",
    weight: 2,
    skills: ["Pandas", "NumPy", "TensorFlow", "PyTorch", "scikit-learn", "Machine Learning", "Deep Learning", "NLP", "OpenCV", "Spark", "Power BI", "Tableau"],
  },
  {
    name: "Tools & Practices",
    weight: 1,
    skills: ["Git", "GitHub", "GitLab", "Jira", "Agile", "Scrum", "TDD", "Unit Testing", "Jest", "Selenium", "Postman", "Figma"],
  },
  {
    name: "Soft skills",
    weight: 1,
    skills: ["Leadership", "Communication", "Teamwork", "Problem Solving", "Mentoring", "Ownership", "Collaboration", "Time Management"],
  },
];

/* ---------- 2. DOM handles -------------------------------- */

const dropzone   = document.getElementById("dropzone");
const fileInput  = document.getElementById("fileInput");
const fileNameEl = document.getElementById("fileName");
const analyzeBtn = document.getElementById("analyzeBtn");
const resetBtn   = document.getElementById("resetBtn");
const errorBox   = document.getElementById("errorBox");
const results    = document.getElementById("results");
const scoreValue = document.getElementById("scoreValue");
const scoreRing  = document.getElementById("scoreRing");
const verdictEl  = document.getElementById("verdict");
const parsedNote = document.getElementById("parsedNote");
const presentList = document.getElementById("presentList");
const missingList = document.getElementById("missingList");
const groupBars  = document.getElementById("groupBars");

const RING_C = 2 * Math.PI * 54; // circumference of the score ring
const state = { file: null, reading: false };

/* ---------- 3. Upload interactions ------------------------ */

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => acceptFile(fileInput.files[0]));

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  acceptFile(e.dataTransfer.files[0]);
});

function acceptFile(file) {
  hideError();
  if (!file) return;

  if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
    showError("That doesn't look like a PDF — please pick a .pdf file.");
    return;
  }

  state.file = file;
  fileNameEl.textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB`;
  analyzeBtn.disabled = false;
  results.hidden = true; // hide any previous result until re-analyzed
}

analyzeBtn.addEventListener("click", analyze);
resetBtn.addEventListener("click", resetAll);

async function analyze() {
  if (!state.file || state.reading) return;

  if (typeof pdfjsLib === "undefined") {
    showError("pdf.js failed to load — check your internet connection and refresh.");
    return;
  }

  state.reading = true;
  analyzeBtn.disabled = true;
  analyzeBtn.classList.add("loading");
  analyzeBtn.textContent = "Reading…";
  hideError();

  try {
    const text = await extractTextFromPdf(state.file);
    if (!text.trim()) {
      throw new Error("No text layer found — is this a scanned resume? This mock only reads text-based PDFs.");
    }
    renderResults(text);
  } catch (err) {
    showError(err.message || "Could not read that PDF.");
  } finally {
    state.reading = false;
    analyzeBtn.disabled = false;
    analyzeBtn.classList.remove("loading");
    analyzeBtn.textContent = "Analyze resume";
  }
}

/* ---------- 4. Text extraction (pdf.js) ------------------- */

async function extractTextFromPdf(file) {
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

/* ---------- 5. Matching + scoring -------------------------- */

function normalizeText(text) {
  return " " + text.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ") + " ";
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Skills with symbols (c++, node.js, ci/cd…) are matched as plain
// substrings; plain words get word boundaries so "go" doesn't
// match "going".
function matchesSkill(norm, skill) {
  const needle = skill.toLowerCase();
  if (/[.+/#]/.test(needle)) return norm.includes(needle);
  return new RegExp("\\b" + escapeRegExp(needle) + "\\b").test(norm);
}

function scoreResume(text) {
  const norm = normalizeText(text);
  const present = []; // { skill, group }
  const missing = [];
  let earned = 0;
  let total = 0;
  const groupScores = [];

  for (const group of SKILL_GROUPS) {
    let groupEarned = 0;
    for (const skill of group.skills) {
      const hit = matchesSkill(norm, skill);
      (hit ? present : missing).push({ skill: skill, group: group.name });
      if (hit) groupEarned += group.weight;
    }
    const groupTotal = group.skills.length * group.weight;
    earned += groupEarned;
    total += groupTotal;
    const foundInGroup = group.skills.filter(
      (s) => present.some((p) => p.skill === s && p.group === group.name)
    ).length;
    groupScores.push({
      name: group.name,
      pct: Math.round((groupEarned / groupTotal) * 100),
      found: foundInGroup,
      count: group.skills.length,
    });
  }

  const found = groupScores.reduce((n, g) => n + g.found, 0);
  return { score: Math.round((earned / total) * 100), present: present, missing: missing, groupScores: groupScores, found: found };
}

function verdictFor(score) {
  if (score >= 85) return { label: "Strong — ready to ship 🚀", tone: "good" };
  if (score >= 70) return { label: "Solid — a few gaps to fill", tone: "ok" };
  if (score >= 50) return { label: "Developing — key skills forming", tone: "warn" };
  return { label: "Early days — start with the fundamentals", tone: "low" };
}

/* ---------- 6. Rendering ----------------------------------- */

function renderResults(text) {
  const result = scoreResume(text);
  const verdict = verdictFor(result.score);

  results.hidden = false;
  resetBtn.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });

  // Score ring + count-up
  scoreValue.textContent = "0";
  scoreRing.style.strokeDashoffset = RING_C; // start empty
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scoreRing.style.strokeDashoffset = RING_C * (1 - result.score / 100);
    });
  });
  animateCount(scoreValue, result.score, 900);

  verdictEl.textContent = verdict.label;
  verdictEl.className = "verdict " + verdict.tone;
  parsedNote.textContent =
    state.file.name + " · " + result.found + " of " + (result.present.length + result.missing.length) + " skills matched · parsed locally";

  // Present skills, grouped by category
  presentList.innerHTML = "";
  let shownAnyGroup = false;
  for (const group of SKILL_GROUPS) {
    const hits = result.present.filter((p) => p.group === group.name);
    if (!hits.length) continue;
    shownAnyGroup = true;
    const wrap = document.createElement("div");
    wrap.className = "chip-group";
    const h = document.createElement("h4");
    h.textContent = group.name;
    const row = document.createElement("div");
    row.className = "chips";
    for (const item of hits) {
      const chip = document.createElement("span");
      chip.className = "chip good";
      chip.textContent = item.skill;
      row.appendChild(chip);
    }
    wrap.appendChild(h);
    wrap.appendChild(row);
    presentList.appendChild(wrap);
  }
  if (!shownAnyGroup) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No known skills detected — the wording may differ from the dictionary.";
    presentList.appendChild(p);
  }

  // Missing skills (same dictionary, flipped)
  missingList.innerHTML = "";
  if (!result.missing.length) {
    const chip = document.createElement("span");
    chip.className = "chip good";
    chip.textContent = "Nothing missing — full coverage! 🎉";
    missingList.appendChild(chip);
  } else {
    for (const item of result.missing) {
      const chip = document.createElement("span");
      chip.className = "chip bad";
      chip.textContent = item.skill;
      chip.title = item.group;
      missingList.appendChild(chip);
    }
  }

  // Category breakdown bars
  groupBars.innerHTML = "";
  for (const g of result.groupScores) {
    const row = document.createElement("div");
    row.className = "bar-row";

    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = g.name;

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    track.appendChild(fill);

    const note = document.createElement("span");
    note.className = "bar-note";
    note.textContent = g.found + "/" + g.count;

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(note);
    groupBars.appendChild(row);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.width = g.pct + "%";
      });
    });
  }
}

function animateCount(el, target, dur) {
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function resetAll() {
  state.file = null;
  fileInput.value = "";
  fileNameEl.textContent = "";
  analyzeBtn.disabled = true;
  results.hidden = true;
  resetBtn.hidden = true;
  scoreRing.style.strokeDashoffset = RING_C;
  hideError();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}
