// --- 配置区 ---
const DATASETS = ["hle", "medagentsbench"];
const MODELS = [
  "SingleLLM_deepseek-v3",
  "SingleLLM_deepseek-r1",
  "ColaCare",
  "MedAgent",
];
const NUM_QUESTIONS = 3;

// --- DOM 元素获取 ---
const datasetList = document.getElementById("dataset-list");
const evaluationArea = document.getElementById("evaluation-area");
const mainTitle = document.getElementById("main-title");
const loadingSpinner = document.getElementById("loading-spinner");
const exportContainer = document.getElementById("export-container");
const paginationNav = document.getElementById("pagination-nav"); // 新增

// --- 状态变量 ---
let currentDatasetName = "";
let userSelections = {};

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
}

/**
 * [重大修改] 加载数据集，但只显示第一个问题
 */
async function loadAndDisplayDataset(datasetName) {
  mainTitle.textContent = `评测数据集: ${datasetName}`;
  evaluationArea.innerHTML = "";
  exportContainer.innerHTML = "";
  paginationNav.innerHTML = ""; // 清空导航
  loadingSpinner.style.display = "block";

  currentDatasetName = datasetName;
  userSelections = {};

  try {
    for (let i = 1; i <= NUM_QUESTIONS; i++) {
      const shuffledModels = [...MODELS].sort(() => Math.random() - 0.5);
      const questionData = await fetchQuestionData(
        datasetName,
        i,
        shuffledModels
      );
      if (questionData) {
        const card = createQACard(questionData);
        evaluationArea.appendChild(card);
      }
    }
    // 加载完成后，创建导航并显示第一个问题
    createPaginationNav();
    showQuestion(1);
  } catch (error) {
    console.error("加载数据集时出错:", error);
    evaluationArea.innerHTML = `<p style="color: red;">加载数据集 "${datasetName}" 失败。</p>`;
  } finally {
    loadingSpinner.style.display = "none";
  }
}

async function fetchQuestionData(datasetName, questionId, modelOrder) {
  const promises = modelOrder.map((modelName) => {
    const url = `results/${datasetName}/${modelName}/${questionId}-result.json`;
    return fetch(url)
      .then((response) => {
        if (!response.ok)
          throw new Error(`网络响应错误: ${response.statusText}`);
        return response.json();
      })
      .then((data) => ({ ...data, modelName }))
      .catch((error) => {
        console.error(`无法加载文件: ${url}`, error);
        return null;
      });
  });
  const results = await Promise.all(promises);
  const validResults = results.filter((r) => r !== null);
  if (validResults.length === 0) return null;
  return {
    id: questionId,
    dataset: datasetName,
    question: validResults[0].question || validResults[0].task,
    options: validResults[0].options || null,
    referenceAnswer: validResults[0].reference_answer,
    modelsData: validResults,
  };
}

/**
 * [重大修改] createQACard, 以匹配图片中的新布局
 */
function createQACard(data) {
  const card = document.createElement("div");
  card.className = "qa-card";
  card.id = `q-${data.dataset}-${data.id}`;

  let optionsHtml = "";
  if (data.options && Array.isArray(data.options)) {
    optionsHtml = '<ol class="question-options">';
    data.options.forEach((option) => (optionsHtml += `<li>${option}</li>`));
    optionsHtml += "</ol>";
  }

  let modelsHtml = "";
  data.modelsData.forEach((modelData, index) => {
    let letter = "";
    if (data.options && data.options.length > 0) {
      letter = modelData.generated_answer;
    }
    const answerTitle = `回答 ${index + 1}: ${letter}`;

    modelsHtml += `
      <div class="model-answer">
          <h4>${answerTitle}</h4>
          <div class="analysis-box">
              <h5>分析:</h5>
              <div class="explanation-content">${
                modelData.case_history.reasoning ||
                modelData.case_history.final_decision.explanation
              }</div>
          </div>
          <div class="radio-wrapper">
              <label>
                  <input type="radio" name="preference" value="${
                    modelData.modelName
                  }" required>
                  回答 ${index + 1}
              </label>
          </div>
      </div>
    `;
  });

  card.innerHTML = `
      <h3>问题 ${data.id}: ${data.question}</h3>
      ${optionsHtml}
      <div class="reference-answer"><strong>参考答案:</strong> <p>${data.referenceAnswer}</p></div>
      <form class="preference-form" data-question-id="${data.id}">
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

/**
 * [修改] 提交后自动跳转到下一题
 */
function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (!form.classList.contains("preference-form")) return;

  const formData = new FormData(form);
  const selectedPreference = formData.get("preference");
  const questionId = parseInt(form.dataset.questionId);

  userSelections[questionId] = selectedPreference;

  const fieldset = form.querySelector("fieldset");
  fieldset.disabled = true;
  form.querySelector("button").style.display = "none";

  // 将反馈信息移到按钮原来的位置
  const feedbackSpan = form.querySelector(".submission-feedback");
  feedbackSpan.textContent = "✓ 已保存";

  // 更新导航栏该题目的状态
  const navLink = document.querySelector(
    `.page-link[data-question-id="${questionId}"]`
  );
  if (navLink) navLink.classList.add("completed");

  // 检查是否全部完成
  if (Object.keys(userSelections).length === NUM_QUESTIONS) {
    showExportButton();
    // 最后一题，不跳转
  } else {
    // 自动跳转到下一题
    const nextQuestionId = questionId + 1;
    setTimeout(() => {
      showQuestion(nextQuestionId);
    }, 300); // 延迟一小会，让用户看到“已保存”的反馈
  }
}

/**
 * [新增] 创建分页导航
 */
function createPaginationNav() {
  for (let i = 1; i <= NUM_QUESTIONS; i++) {
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

/**
 * [新增] 显示指定ID的问题
 */
function showQuestion(questionId) {
  if (questionId > NUM_QUESTIONS || questionId < 1) return;

  // 隐藏所有卡片
  document
    .querySelectorAll(".qa-card")
    .forEach((card) => card.classList.remove("active"));
  // 显示目标卡片
  const targetCard = document.getElementById(
    `q-${currentDatasetName}-${questionId}`
  );
  if (targetCard) {
    targetCard.classList.add("active");
    // 更新导航链接的激活状态
    document.querySelectorAll(".page-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.questionId == questionId);
    });
    // 更新最后一题的按钮文本
    const formButton = targetCard.querySelector(".preference-form button");
    if (formButton) {
      if (questionId === NUM_QUESTIONS) {
        formButton.textContent = "保存并完成评测";
      } else {
        formButton.textContent = "保存并进入下一题";
      }
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
