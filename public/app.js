// ==================== 全局状态 ====================
const API = '/api';
let currentTab = 'home';
let recordType = 'expense';
let editingRecordId = null;
let allMainCategories = [];
let allSubCategories = [];
let allIncomeCategories = [];
let currentRecords = [];
let currentMonth, currentYear;

// ==================== 初始化 ====================
function init() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  document.getElementById('headerDate').textContent = `${currentYear}年${currentMonth}月`;
  
  loadMainCategories();
  loadIncomeCategories();
  loadHomePage();
  initStatsPage();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + tab).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => {
    if (t.textContent.includes(tab === 'home' ? '记账' : tab === 'stats' ? '统计' : '分类')) {
      t.classList.add('active');
    }
  });
  if (tab === 'home') loadHomePage();
  if (tab === 'stats') loadStats();
  if (tab === 'category') loadCategoryPage();
}

// ==================== 首页 ====================
async function loadHomePage() {
  await Promise.all([loadSummary(), loadRecords(), loadBudget()]);
}

async function loadSummary() {
  const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const res = await fetch(`${API}/stats/month-detail?year=${currentYear}&month=${currentMonth}`);
  const data = await res.json();
  
  const income = data.totalIncome || 0;
  const expense = data.totalExpense || 0;
  const balance = income - expense;

  document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card">
      <div class="label">本月收入</div>
      <div class="amount income">¥${income.toFixed(2)}</div>
    </div>
    <div class="summary-card">
      <div class="label">本月支出</div>
      <div class="amount expense">¥${expense.toFixed(2)}</div>
    </div>
    <div class="summary-card">
      <div class="label">本月结余</div>
      <div class="amount balance">¥${balance.toFixed(2)}</div>
    </div>
  `;
}

async function loadBudget() {
  const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const res = await fetch(`${API}/budget?month=${ym}`);
  const budget = await res.json();
  const budgetAmount = budget.amount || 0;

  // 获取本月支出
  const statsRes = await fetch(`${API}/stats/month-detail?year=${currentYear}&month=${currentMonth}`);
  const stats = await statsRes.json();
  const spent = stats.totalExpense || 0;

  const barEl = document.getElementById('budgetBar');
  const alertEl = document.getElementById('budgetAlert');

  if (budgetAmount > 0) {
    const percent = Math.min((spent / budgetAmount) * 100, 100);
    let statusClass = 'safe';
    if (percent > 90) statusClass = 'danger';
    else if (percent > 70) statusClass = 'warning';

    barEl.innerHTML = `
      <div class="budget-header">
        <span>📊 月度预算</span>
        <span style="cursor:pointer;color:var(--primary)" onclick="openBudgetModal()">✏️ 设置</span>
      </div>
      <div class="progress-bg">
        <div class="progress-fill ${statusClass}" style="width:${percent}%"></div>
      </div>
      <div class="budget-footer">
        <span>已花 ¥${spent.toFixed(0)}</span>
        <span>预算 ¥${budgetAmount.toFixed(0)} (${percent.toFixed(0)}%)</span>
      </div>
    `;

    if (spent > budgetAmount) {
      alertEl.classList.add('show');
      document.getElementById('budgetAlertText').innerHTML = 
        `本月预算已超支！超出 <span class="alert-amount">¥${(spent - budgetAmount).toFixed(2)}</span>`;
    } else {
      alertEl.classList.remove('show');
    }
  } else {
    barEl.innerHTML = `
      <div class="budget-header">
        <span>📊 月度预算（未设置）</span>
        <span style="cursor:pointer;color:var(--primary)" onclick="openBudgetModal()">✏️ 设置</span>
      </div>
      <div style="text-align:center;color:var(--text-secondary);font-size:13px;padding:12px 0">
        点击右侧「设置」创建月度预算，控制花销
      </div>
    `;
    alertEl.classList.remove('show');
  }
}

async function loadRecords() {
  const res = await fetch(`${API}/records?year=${currentYear}&month=${currentMonth}`);
  const records = await res.json();
  currentRecords = records;

  const listEl = document.getElementById('recordList');
  if (records.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>本月还没有记账记录</p>
        <p style="font-size:12px;margin-top:4px">点击右下角 + 开始记账吧</p>
      </div>
    `;
    return;
  }

  // 按日期分组
  const grouped = {};
  records.forEach(r => {
    const d = r.record_date;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(r);
  });

  let html = '';
  for (const [date, items] of Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))) {
    const dayTotal = items.reduce((sum, r) => sum + (r.type === 'income' ? r.amount : -r.amount), 0);
    const [y, m, d] = date.split('-');
    html += `<div style="font-size:13px;font-weight:600;color:var(--text-secondary);padding:8px 4px 4px">
      📅 ${m}月${d}日 ${dayTotal >= 0 ? '收' : '支'} ¥${Math.abs(dayTotal).toFixed(2)}
    </div>`;
    
    items.forEach(r => {
      const isIncome = r.type === 'income';
      const icon = isIncome ? (r.income_category_icon || '💰') : (r.sub_category_icon || r.main_category_icon || '📌');
      const name = isIncome ? (r.income_category_name || '收入') : (r.sub_category_name || r.main_category_name || '支出');
      const amountClass = isIncome ? 'income' : 'expense';
      const bgClass = isIncome ? 'income-bg' : 'expense-bg';
      const prefix = isIncome ? '+' : '-';

      html += `
        <div class="record-item">
          <div class="record-icon ${bgClass}">${icon}</div>
          <div class="record-info">
            <div class="record-category">${name}</div>
            ${r.note ? `<div class="record-note">${escapeHtml(r.note)}</div>` : ''}
          </div>
          <div class="record-right">
            <div class="record-amount ${amountClass}">${prefix}¥${r.amount.toFixed(2)}</div>
            <div class="record-actions">
              <button class="btn-del" onclick="editRecord(${r.id})" title="编辑">✏️</button>
              <button class="btn-del" onclick="deleteRecord(${r.id})" title="删除">🗑️</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  listEl.innerHTML = html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 记账弹窗 ====================
function openRecordModal(record) {
  editingRecordId = record ? record.id : null;
  document.getElementById('recordModalTitle').textContent = record ? '编辑记录' : '记一笔';
  document.getElementById('recordModal').classList.remove('hidden');

  if (record) {
    setRecordType(record.type);
    document.getElementById('recordAmount').value = record.amount;
    document.getElementById('recordDate').value = record.record_date;
    document.getElementById('recordNote').value = record.note || '';
    if (record.type === 'expense') {
      setTimeout(() => {
        document.getElementById('recordMainCategory').value = record.main_category_id;
        onMainCategoryChange();
        setTimeout(() => {
          document.getElementById('recordSubCategory').value = record.sub_category_id;
        }, 100);
      }, 50);
    } else {
      setTimeout(() => {
        document.getElementById('recordIncomeCategory').value = record.income_category_id;
      }, 50);
    }
  } else {
    setRecordType('expense');
    document.getElementById('recordAmount').value = '';
    document.getElementById('recordNote').value = '';
    document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];
  }
}

function closeRecordModal() {
  document.getElementById('recordModal').classList.add('hidden');
  editingRecordId = null;
}

function setRecordType(type) {
  recordType = type;
  const expenseBtn = document.getElementById('typeExpense');
  const incomeBtn = document.getElementById('typeIncome');
  const expenseMain = document.getElementById('expenseMainGroup');
  const expenseSub = document.getElementById('expenseSubGroup');
  const incomeGroup = document.getElementById('incomeCategoryGroup');

  expenseBtn.className = 'type-btn';
  incomeBtn.className = 'type-btn';

  if (type === 'expense') {
    expenseBtn.classList.add('active-expense');
    expenseMain.style.display = 'block';
    expenseSub.style.display = 'block';
    incomeGroup.classList.add('hidden');
    populateMainSelect();
    onMainCategoryChange();
  } else {
    incomeBtn.classList.add('active-income');
    expenseMain.style.display = 'none';
    expenseSub.style.display = 'none';
    incomeGroup.classList.remove('hidden');
    populateIncomeSelect();
  }
}

function populateMainSelect() {
  const sel = document.getElementById('recordMainCategory');
  sel.innerHTML = allMainCategories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

function onMainCategoryChange() {
  const mainId = document.getElementById('recordMainCategory').value;
  const subs = allSubCategories.filter(s => s.main_category_id == mainId);
  const sel = document.getElementById('recordSubCategory');
  sel.innerHTML = subs.map(s => `<option value="${s.id}">${s.icon} ${s.name}</option>`).join('');
}

function populateIncomeSelect() {
  const sel = document.getElementById('recordIncomeCategory');
  sel.innerHTML = allIncomeCategories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
}

async function saveRecord() {
  const amount = parseFloat(document.getElementById('recordAmount').value);
  if (!amount || amount <= 0) return alert('请输入有效金额');

  const data = {
    type: recordType,
    amount: amount,
    note: document.getElementById('recordNote').value,
    record_date: document.getElementById('recordDate').value,
  };

  if (recordType === 'expense') {
    data.main_category_id = parseInt(document.getElementById('recordMainCategory').value);
    data.sub_category_id = parseInt(document.getElementById('recordSubCategory').value);
  } else {
    data.income_category_id = parseInt(document.getElementById('recordIncomeCategory').value);
  }

  const url = editingRecordId ? `${API}/records/${editingRecordId}` : `${API}/records`;
  const method = editingRecordId ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (res.ok) {
    closeRecordModal();
    loadHomePage();
  } else {
    alert('保存失败');
  }
}

async function editRecord(id) {
  const record = currentRecords.find(r => r.id === id);
  if (record) openRecordModal(record);
}

async function deleteRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  await fetch(`${API}/records/${id}`, { method: 'DELETE' });
  loadHomePage();
}

// ==================== 预算弹窗 ====================
function openBudgetModal() {
  const ym = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  document.getElementById('budgetMonth').value = ym;
  document.getElementById('budgetAmount').value = '';
  document.getElementById('budgetModal').classList.remove('hidden');
  
  fetch(`${API}/budget?month=${ym}`)
    .then(r => r.json())
    .then(b => {
      if (b.amount) document.getElementById('budgetAmount').value = b.amount;
    });
}

function closeBudgetModal() {
  document.getElementById('budgetModal').classList.add('hidden');
}

async function saveBudget() {
  const month = document.getElementById('budgetMonth').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value);
  if (!month) return alert('请选择月份');
  if (isNaN(amount) || amount < 0) return alert('请输入有效预算金额');

  await fetch(`${API}/budget`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month, amount })
  });

  closeBudgetModal();
  loadHomePage();
}

// ==================== 统计页 ====================
function initStatsPage() {
  const yearSel = document.getElementById('statsYear');
  const now = new Date();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    yearSel.innerHTML += `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}年</option>`;
  }
  document.getElementById('statsMonth').value = now.getMonth() + 1;
}

async function loadStats() {
  const year = document.getElementById('statsYear').value;
  const month = document.getElementById('statsMonth').value;
  const container = document.getElementById('statsContent');

  if (month === '0') {
    // 全年统计
    const res = await fetch(`${API}/stats/monthly?year=${year}`);
    const data = await res.json();
    let html = '<div class="chart-container"><h3>📊 月度收支趋势</h3>';

    const allMonths = Array.from({length: 12}, (_, i) => i + 1);
    const incomeMap = {};
    const expenseMap = {};
    data.incomeStats.forEach(s => incomeMap[s.month] = s.total);
    data.expenseStats.forEach(s => expenseMap[s.month] = s.total);

    const maxVal = Math.max(
      ...Object.values(incomeMap).concat(Object.values(expenseMap)), 1
    );

    allMonths.forEach(m => {
      const inc = incomeMap[String(m).padStart(2, '0')] || 0;
      const exp = expenseMap[String(m).padStart(2, '0')] || 0;
      html += `
        <div style="margin-bottom:8px">
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:2px">${m}月</div>
          <div style="display:flex;gap:4px;align-items:center">
            <span style="font-size:11px;width:30px;color:var(--income)">收</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill income-bar" style="width:${(inc/maxVal)*100}%">
                <span class="chart-bar-value">${inc.toFixed(0)}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
            <span style="font-size:11px;width:30px;color:var(--expense)">支</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill expense-bar" style="width:${(exp/maxVal)*100}%">
                <span class="chart-bar-value">${exp.toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';

    // 全年支出分类饼图替代（用条形图）
    if (data.expenseByMain && data.expenseByMain.length > 0) {
      const maxExp = Math.max(...data.expenseByMain.map(e => e.total));
      html += '<div class="chart-container"><h3>📤 全年支出分类</h3>';
      data.expenseByMain.forEach((e, i) => {
        html += `
          <div class="chart-bar-row">
            <span class="chart-bar-label">${e.icon} ${e.name}</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill category-${i%4}" style="width:${(e.total/maxExp)*100}%">
                <span class="chart-bar-value">¥${e.total.toFixed(0)}</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    container.innerHTML = html;
  } else {
    // 单月详细统计
    const res = await fetch(`${API}/stats/month-detail?year=${year}&month=${month}`);
    const data = await res.json();
    let html = '';

    html += `
      <div class="summary-cards">
        <div class="summary-card">
          <div class="label">收入</div>
          <div class="amount income">¥${data.totalIncome.toFixed(2)}</div>
        </div>
        <div class="summary-card">
          <div class="label">支出</div>
          <div class="amount expense">¥${data.totalExpense.toFixed(2)}</div>
        </div>
        <div class="summary-card">
          <div class="label">结余</div>
          <div class="amount balance">¥${(data.totalIncome - data.totalExpense).toFixed(2)}</div>
        </div>
      </div>
    `;

    if (data.expenseBySub && data.expenseBySub.length > 0) {
      const maxExp = Math.max(...data.expenseBySub.map(e => e.total));
      html += '<div class="chart-container"><h3>📤 支出明细</h3>';
      data.expenseBySub.forEach((e, i) => {
        html += `
          <div class="chart-bar-row">
            <span class="chart-bar-label">${e.sub_icon} ${e.sub_name}</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill expense-bar" style="width:${(e.total/maxExp)*100}%">
                <span class="chart-bar-value">¥${e.total.toFixed(0)} (${e.count}笔)</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    if (data.incomeByCategory && data.incomeByCategory.length > 0) {
      const maxInc = Math.max(...data.incomeByCategory.map(e => e.total));
      html += '<div class="chart-container"><h3>💰 收入明细</h3>';
      data.incomeByCategory.forEach(e => {
        html += `
          <div class="chart-bar-row">
            <span class="chart-bar-label">${e.icon} ${e.name}</span>
            <div class="chart-bar-track">
              <div class="chart-bar-fill income-bar" style="width:${(e.total/maxInc)*100}%">
                <span class="chart-bar-value">¥${e.total.toFixed(0)} (${e.count}笔)</span>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    if ((!data.expenseBySub || data.expenseBySub.length === 0) && (!data.incomeByCategory || data.incomeByCategory.length === 0)) {
      html += '<div class="empty-state"><div class="empty-icon">📭</div><p>该月暂无记录</p></div>';
    }

    container.innerHTML = html;
  }
}

// ==================== 分类管理 ====================
async function loadCategoryPage() {
  await Promise.all([loadMainCategories(), loadIncomeCategories()]);
  renderMainCategories();
  renderIncomeCategories();
  renderSubCategories();
}

async function loadMainCategories() {
  const res = await fetch(`${API}/expense-main`);
  allMainCategories = await res.json();
  const subRes = await fetch(`${API}/expense-sub`);
  allSubCategories = await subRes.json();
}

async function loadIncomeCategories() {
  const res = await fetch(`${API}/income-category`);
  allIncomeCategories = await res.json();
}

function renderMainCategories() {
  const container = document.getElementById('mainCategoryTags');
  container.innerHTML = allMainCategories.map(c => `
    <span class="category-tag">
      ${c.icon} ${c.name}
      <span class="tag-del" onclick="deleteMainCategory(${c.id})" title="删除">×</span>
    </span>
  `).join('');
}

function renderIncomeCategories() {
  const container = document.getElementById('incomeCategoryTags');
  container.innerHTML = allIncomeCategories.map(c => `
    <span class="category-tag">
      ${c.icon} ${c.name}
      <span class="tag-del" onclick="deleteIncomeCategory(${c.id})" title="删除">×</span>
    </span>
  `).join('');
}

function renderSubCategories() {
  const container = document.getElementById('subCategoryList');
  const mainSel = document.getElementById('newSubMain');
  
  mainSel.innerHTML = allMainCategories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

  let html = '';
  allMainCategories.forEach(main => {
    const subs = allSubCategories.filter(s => s.main_category_id === main.id);
    html += `<div style="margin-bottom:8px">
      <strong style="font-size:13px">${main.icon} ${main.name}</strong>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">`;
    subs.forEach(s => {
      html += `
        <span class="sub-category-item">
          ${s.icon} ${s.name}
          <span class="sub-del" onclick="deleteSubCategory(${s.id})" title="删除">×</span>
        </span>`;
    });
    html += '</div></div>';
  });
  container.innerHTML = html || '<p style="color:var(--text-secondary);font-size:13px">暂无子类</p>';
}

async function addMainCategory() {
  const name = document.getElementById('newMainName').value.trim();
  const icon = document.getElementById('newMainIcon').value.trim();
  if (!name) return alert('请输入大类名称');
  await fetch(`${API}/expense-main`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, icon: icon || '📌' })
  });
  document.getElementById('newMainName').value = '';
  document.getElementById('newMainIcon').value = '';
  await loadMainCategories();
  renderMainCategories();
  renderSubCategories();
}

async function deleteMainCategory(id) {
  if (!confirm('删除该大类将同时删除其下所有子类和相关记录，确定吗？')) return;
  await fetch(`${API}/expense-main/${id}`, { method: 'DELETE' });
  await loadMainCategories();
  renderMainCategories();
  renderSubCategories();
}

async function addSubCategory() {
  const mainId = document.getElementById('newSubMain').value;
  const name = document.getElementById('newSubName').value.trim();
  const icon = document.getElementById('newSubIcon').value.trim();
  if (!name) return alert('请输入子类名称');
  await fetch(`${API}/expense-sub`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ main_category_id: parseInt(mainId), name, icon: icon || '📌' })
  });
  document.getElementById('newSubName').value = '';
  document.getElementById('newSubIcon').value = '';
  await loadMainCategories();
  renderSubCategories();
}

async function deleteSubCategory(id) {
  if (!confirm('确定删除该子类吗？')) return;
  await fetch(`${API}/expense-sub/${id}`, { method: 'DELETE' });
  await loadMainCategories();
  renderSubCategories();
}

async function addIncomeCategory() {
  const name = document.getElementById('newIncomeName').value.trim();
  const icon = document.getElementById('newIncomeIcon').value.trim();
  if (!name) return alert('请输入收入分类名称');
  await fetch(`${API}/income-category`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, icon: icon || '💰' })
  });
  document.getElementById('newIncomeName').value = '';
  document.getElementById('newIncomeIcon').value = '';
  await loadIncomeCategories();
  renderIncomeCategories();
}

async function deleteIncomeCategory(id) {
  if (!confirm('确定删除该收入分类吗？')) return;
  await fetch(`${API}/income-category/${id}`, { method: 'DELETE' });
  await loadIncomeCategories();
  renderIncomeCategories();
}

// ==================== 启动 ====================
init();
