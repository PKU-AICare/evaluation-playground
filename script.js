// --- 配置区 ---
const DATASETS = ["ConfAgents", "HealthFlow"];
const MODELS = {
  ConfAgents: ["conformal", "colacare", "mdagents", "medagent"],
  HealthFlow: [
    "SingleLLM_deepseek-v3",
    "SingleLLM_deepseek-r1",
    "ColaCare",
    "MedAgent",
  ],
};
const NUM_QUESTIONS = {
  ConfAgents: 16,
  HealthFlow: 16,
};

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

async function loadAndDisplayDataset(datasetName) {
  mainTitle.textContent = `评测数据集: ${datasetName}`;
  evaluationArea.innerHTML = "";
  exportContainer.innerHTML = "";
  paginationNav.innerHTML = ""; // 清空导航
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
        const card = createQACard(shuffledQuestionData);
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

async function fetchQuestionData(datasetName) {
  const url = `data/${datasetName}.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`网络响应错误: ${response.statusText}`);
    }
    const data = await response.json();
    return data; // 直接返回从JSON文件读取的数据列表
  } catch (error) {
    console.error(`无法加载文件: ${url}`, error);
    return null;
  }
}

function shuffleQuestionData(questionData, shuffledModels) {
  // 创建问题数据的副本，保留基本信息
  const shuffledData = {
    dataset: questionData.dataset,
    question: questionData.question,
    options: questionData.options,
    answer: questionData.answer,
  };

  // 创建新的modelsData数组，按照shuffledModels的顺序排列
  shuffledData.modelsData = [];

  shuffledModels.forEach((modelName, index) => {
    // 从原始数据中获取对应模型的数据
    const modelData = questionData[modelName];
    if (modelData) {
      // 添加模型名称到数据中，用于后续显示
      const shuffledModelData = {
        ...modelData,
        modelName: modelName,
        originalIndex: index,
      };
      shuffledData.modelsData.push(shuffledModelData);
    }
  });

  return shuffledData;
}

function createQACard(data) {
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

  let modelsHtml = "";
  data.modelsData.forEach((modelData, index) => {
    let letter = "";
    if (data.options && modelData.pred_answer) {
      letter = modelData.pred_answer;
    }
    const answerTitle = `回答 ${index + 1}: ${letter}`;

    // 处理reasoning字段，可能是数组或字符串
    let reasoningContent = "";
    if (modelData.reasoning) {
      if (Array.isArray(modelData.reasoning)) {
        reasoningContent = modelData.reasoning.join("<br><br>");
      } else {
        reasoningContent = modelData.reasoning;
      }
    }

    modelsHtml += `
      <div class="model-answer">
          <h4>${answerTitle}</h4>
          <div class="analysis-box">
              <h5>分析:</h5>
              <div class="explanation-content">${reasoningContent}</div>
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
      <div class="reference-answer"><strong>参考答案:</strong> <p>${data.answer}</p></div>
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
  if (
    Object.keys(userSelections).length === NUM_QUESTIONS[currentDatasetName]
  ) {
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

/**
 * [新增] 显示指定ID的问题
 */
function showQuestion(questionId) {
  if (questionId > NUM_QUESTIONS[currentDatasetName] || questionId < 1) return;

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
      if (questionId === NUM_QUESTIONS[currentDatasetName]) {
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
