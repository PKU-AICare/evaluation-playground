// --- 配置区 ---
const DATASETS = ["ConfAgents", "HealthFlow"];
const MODELS = {
  ConfAgents: ["conformal", "colacare", "mdagents", "medagent"],
  HealthFlow: ["alita", "biomni", "healthflow", "stella"],
};
const NUM_QUESTIONS = {
  ConfAgents: 16,
  HealthFlow: 20,
};
const CSV_ROW_LIMIT = 5; // 定义CSV可折叠的行数阈值

// --- 全局状态变量 ---
let currentDatasetName = "";
let userSelections = {};

// --- DOM 元素获取 ---
const datasetList = document.getElementById("dataset-list");
const evaluationArea = document.getElementById("evaluation-area");
const mainTitle = document.getElementById("main-title");
const loadingSpinner = document.getElementById("loading-spinner");
const exportContainer = document.getElementById("export-container");
const paginationNav = document.getElementById("pagination-nav");

// --- 初始化 Markdown 转换器 ---
const markdownConverter = new showdown.Converter({
  literalMidWordUnderscores: true,
});

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", () => {
  populateSidebar();
  setupEventListeners();
});

function populateSidebar() {
  DATASETS.forEach((datasetName) => {
    const li = document.createElement("li");
    li.textContent = datasetName;
    li.dataset.dataset = datasetName;
    datasetList.appendChild(li);
  });
}

function setupEventListeners() {
  datasetList.addEventListener("click", (event) => {
    if (event.target.tagName === "LI") {
      const datasetName = event.target.dataset.dataset;
      document
        .querySelectorAll("#dataset-list li")
        .forEach((li) => li.classList.remove("active"));
      event.target.classList.add("active");
      loadAndDisplayDataset(datasetName);
    }
  });
  evaluationArea.addEventListener("submit", handleFormSubmit);

  evaluationArea.addEventListener("click", (event) => {
    if (event.target.matches(".csv-toggle-button")) {
      handleCsvToggle(event.target);
    }
  });
}

async function loadAndDisplayDataset(datasetName) {
  mainTitle.textContent = `评测对象: ${datasetName}`;
  evaluationArea.innerHTML = "";
  exportContainer.innerHTML = "";
  paginationNav.innerHTML = "";
  loadingSpinner.style.display = "block";

  currentDatasetName = datasetName;
  userSelections = {};

  try {
    const questionData = await fetchQuestionData(datasetName);
    for (let i = 0; i < NUM_QUESTIONS[datasetName]; i++) {
      const shuffledModels = [...MODELS[datasetName]].sort(
        () => Math.random() - 0.5
      );

      if (questionData && questionData[i]) {
        const shuffledQuestionData = shuffleQuestionData(
          questionData[i],
          shuffledModels
        );
        shuffledQuestionData.id = i + 1;
        const card = await createQACard(shuffledQuestionData);
        evaluationArea.appendChild(card);
      }
    }
    createPaginationNav();
    showQuestion(1);
  } catch (error) {
    console.error("加载数据时出错:", error);
    evaluationArea.innerHTML = `<p style="color: red;">加载评测对象 "${datasetName}" 失败。</p>`;
  } finally {
    loadingSpinner.style.display = "none";
  }
}

async function fetchQuestionData(datasetName) {
  const url = `data/${datasetName}.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`网络响应错误: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`无法加载文件: ${url}`, error);
    return null;
  }
}

function shuffleQuestionData(questionData, shuffledModels) {
  const shuffledData = {
    qid: questionData.qid,
    dataset: questionData.dataset,
    question: questionData.question || questionData.task,
    options: questionData.options,
    answer: questionData.reference_answer,
  };

  shuffledData.modelsData = [];
  shuffledModels.forEach((modelName, index) => {
    const modelData = questionData[modelName];
    if (modelData) {
      shuffledData.modelsData.push({
        ...modelData,
        modelName: modelName,
        originalIndex: index,
      });
    }
  });

  return shuffledData;
}

async function renderCsvToTable(csvPath) {
  try {
    const response = await fetch(csvPath);
    if (!response.ok) throw new Error(`获取CSV失败: ${response.statusText}`);
    const csvText = await response.text();
    const lines = csvText.trim().split("\n");
    if (lines.length === 0) return "";

    const dataRows = lines.slice(1);
    const isCollapsible = dataRows.length > CSV_ROW_LIMIT;

    let tableHtml = '<table class="rendered-csv-table">';
    const headers = lines[0].split(",");
    tableHtml += "<thead><tr>";
    headers.forEach((h) => (tableHtml += `<th>${h.trim()}</th>`));
    tableHtml += "</tr></thead><tbody>";

    dataRows.forEach((line, index) => {
      const rowClass =
        isCollapsible && index >= CSV_ROW_LIMIT ? "csv-row-hidden" : "";
      const cells = line.split(",");
      tableHtml += `<tr class="${rowClass}">`;
      cells.forEach((cell) => (tableHtml += `<td>${cell.trim()}</td>`));
      tableHtml += "</tr>";
    });

    tableHtml += "</tbody></table>";

    let buttonHtml = "";
    if (isCollapsible) {
      buttonHtml = `<button class="csv-toggle-button" data-total-rows="${dataRows.length}">显示全部 ${dataRows.length} 行</button>`;
    }

    return `<div class="csv-container">${tableHtml}${buttonHtml}</div>`;
  } catch (error) {
    console.error(`渲染CSV时出错 ${csvPath}:`, error);
    return `<p style="color: red;">加载 ${csvPath} 出错</p>`;
  }
}

async function renderTxtFile(txtPath) {
  try {
    const response = await fetch(txtPath);
    if (!response.ok) throw new Error(`获取TXT失败: ${response.statusText}`);
    const textContent = await response.text();
    const sanitizer = document.createElement("div");
    sanitizer.textContent = textContent;
    return `<pre class="rendered-txt-content">${sanitizer.innerHTML}</pre>`;
  } catch (error) {
    console.error(`渲染TXT时出错 ${txtPath}:`, error);
    return `<p style="color: red;">加载 ${txtPath} 出错</p>`;
  }
}

function handleCsvToggle(button) {
  const container = button.closest(".csv-container");
  if (!container) return;

  container.classList.toggle("is-expanded");
  const isExpanded = container.classList.contains("is-expanded");
  const totalRows = button.dataset.totalRows;

  if (isExpanded) {
    button.textContent = `收起`;
  } else {
    button.textContent = `显示全部 ${totalRows} 行`;
  }
}

async function createQACard(data) {
  const card = document.createElement("div");
  card.className = "qa-card";
  card.id = `q-${currentDatasetName}-${data.id}`;

  let optionsHtml = "";
  if (data.options && typeof data.options === "object") {
    optionsHtml = '<ol class="question-options">';
    Object.entries(data.options).forEach(([key, value]) => {
      optionsHtml += `<li>${value}</li>`;
    });
    optionsHtml += "</ol>";
  }

  const questionHtml = markdownConverter.makeHtml(data.question);

  let answerHtml = "";
  if (Array.isArray(data.answer)) {
    for (const item of data.answer) {
      const path = item.trim();
      if (path.endsWith(".png") || path.endsWith(".jpg")) {
        answerHtml += `<img src="${path}" alt="参考图片" class="rendered-image">`;
      } else if (path.endsWith(".csv")) {
        answerHtml += await renderCsvToTable(path);
      } else if (path.endsWith(".txt")) {
        answerHtml += await renderTxtFile(path);
      } else {
        answerHtml += markdownConverter.makeHtml(path);
      }
    }
  } else if (data.answer) {
    answerHtml = markdownConverter.makeHtml(data.answer);
  }

  let modelsHtml = "";
  let modelIndex = 0;
  for (const modelData of data.modelsData) {
    const modelAnswerText = modelData.final_answer;
    const hasOptions = data.options;
    const modelAnswerHtml = markdownConverter.makeHtml(modelAnswerText);

    let artifactsHtml = "";
    if (modelData.artifacts && Array.isArray(modelData.artifacts)) {
      for (const item of modelData.artifacts) {
        const path = item.trim();
        if (path.endsWith(".png") || path.endsWith(".jpg")) {
          artifactsHtml += `<img src="${path}" alt="模型生成图片" class="rendered-image">`;
        } else if (path.endsWith(".csv")) {
          artifactsHtml += await renderCsvToTable(path);
        } else if (path.endsWith(".txt")) {
          artifactsHtml += await renderTxtFile(path);
        }
      }
    }

    if (Array.isArray(modelData.reasoning)) {
      modelData.reasoning = modelData.reasoning.join("\n");
    }

    const answerTitle = `回答 ${modelIndex + 1}:${
      hasOptions ? ` ${modelAnswerText}` : ""
    }`;
    const analysisContent = hasOptions
      ? `<h5>分析:</h5><div class="explanation-content">${markdownConverter.makeHtml(
          modelData.reasoning || ""
        )}</div>`
      : `<div class="explanation-content">${modelAnswerHtml}${artifactsHtml}</div>`;

    modelsHtml += `
      <div class="model-answer">
          <h4>${answerTitle}</h4>
          <div class="analysis-box">
              ${analysisContent}
          </div>
          <div class="radio-wrapper">
              <label>
                  <input type="radio" name="preference" value="${
                    modelData.modelName
                  }" required>
                  回答 ${modelIndex + 1}
              </label>
          </div>
      </div>
    `;
    modelIndex++;
  }

  card.innerHTML = `
      <h3>问题 ${data.id}: ${questionHtml}</h3>
      ${optionsHtml}
      <div class="reference-answer"><strong>参考答案:</strong>${answerHtml}</div>
      <form class="preference-form" data-question-id="${data.id}" data-qid="${data.qid}">
          <fieldset>
              <legend>请选择以下哪一个回答更好？</legend>
              <div class="models-comparison">${modelsHtml}</div>
              <div class="form-footer">
                  <label>
                      <input type="radio" name="preference" value="None" required> 都不好
                  </label>
                  <button type="submit">保存并进入下一题</button>
                  <span class="submission-feedback"></span>
              </div>
          </fieldset>
      </form>
  `;
  return card;
}

function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (!form.classList.contains("preference-form")) return;

  const formData = new FormData(form);
  const selectedPreference = formData.get("preference");
  const questionId = parseInt(form.dataset.questionId);
  const qid = form.dataset.qid;

  userSelections[qid] = selectedPreference;

  const feedbackSpan = form.querySelector(".submission-feedback");
  feedbackSpan.textContent = "✓ 已保存";

  const navLink = document.querySelector(
    `.page-link[data-question-id="${questionId}"]`
  );
  if (navLink) {
    navLink.classList.add("completed");
  }

  if (
    Object.keys(userSelections).length === NUM_QUESTIONS[currentDatasetName]
  ) {
    showExportButton();
  } else {
    const nextQuestionId = questionId + 1;
    setTimeout(() => {
      showQuestion(nextQuestionId);
    }, 300);
  }
}

function createPaginationNav() {
  for (let i = 1; i <= NUM_QUESTIONS[currentDatasetName]; i++) {
    const link = document.createElement("a");
    link.className = "page-link";
    link.textContent = i;
    link.href = "#";
    link.dataset.questionId = i;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      showQuestion(i);
    });
    paginationNav.appendChild(link);
  }
}

function showQuestion(questionId) {
  if (questionId > NUM_QUESTIONS[currentDatasetName] || questionId < 1) return;

  document
    .querySelectorAll(".qa-card")
    .forEach((card) => card.classList.remove("active"));
  const targetCard = document.getElementById(
    `q-${currentDatasetName}-${questionId}`
  );
  if (targetCard) {
    targetCard.classList.add("active");
    document
      .getElementById("main-title")
      .scrollIntoView({ behavior: "smooth" });

    // 当显示问题时，恢复之前的选择
    const form = targetCard.querySelector(".preference-form");
    const qid = form.dataset.qid;
    const feedbackSpan = form.querySelector(".submission-feedback");

    if (userSelections.hasOwnProperty(qid)) {
      const savedValue = userSelections[qid];
      const radioToCheck = form.querySelector(
        `input[name="preference"][value="${savedValue}"]`
      );
      if (radioToCheck) {
        radioToCheck.checked = true;
      }
      feedbackSpan.textContent = "✓ 已保存"; // 如果有答案，则显示“已保存”
    } else {
      feedbackSpan.textContent = ""; // 如果是新问题，则清空反馈信息
    }

    if (window.MathJax) {
      window.MathJax.typesetPromise([targetCard]).catch((err) =>
        console.log("MathJax Typeset Error: ", err)
      );
    }

    document.querySelectorAll(".page-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.questionId == questionId);
    });
    const formButton = targetCard.querySelector(".preference-form button");
    if (formButton) {
      formButton.textContent =
        questionId === NUM_QUESTIONS[currentDatasetName]
          ? "保存并完成评测"
          : "保存并进入下一题";
    }
  }
}

function showExportButton() {
  exportContainer.innerHTML = "";
  const exportButton = document.createElement("button");
  exportButton.className = "export-button";
  exportButton.textContent = `所有问题已评测！导出 "${currentDatasetName}" 的结果`;
  exportButton.onclick = exportSelectionsToJson;
  exportContainer.appendChild(exportButton);
  exportButton.scrollIntoView({ behavior: "smooth" });
}

function exportSelectionsToJson() {
  const dataToExport = {
    dataset: currentDatasetName,
    exportDate: new Date().toISOString(),
    selections: userSelections,
  };
  const jsonString = JSON.stringify(dataToExport, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentDatasetName}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
