const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 数据库初始化 ====================
const db = new Database('money_tracker.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建表
db.exec(`
  -- 支出大类
  CREATE TABLE IF NOT EXISTS expense_category_main (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '📌',
    sort_order INTEGER DEFAULT 0
  );

  -- 支出二类
  CREATE TABLE IF NOT EXISTS expense_category_sub (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    main_category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📌',
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (main_category_id) REFERENCES expense_category_main(id) ON DELETE CASCADE
  );

  -- 收入分类
  CREATE TABLE IF NOT EXISTS income_category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '💰',
    sort_order INTEGER DEFAULT 0
  );

  -- 账单记录
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    amount REAL NOT NULL,
    main_category_id INTEGER,
    sub_category_id INTEGER,
    income_category_id INTEGER,
    note TEXT DEFAULT '',
    record_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  -- 预算设置
  CREATE TABLE IF NOT EXISTS budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL DEFAULT 0
  );
`);

// 初始化默认数据
function initDefaultData() {
  const mainCount = db.prepare('SELECT COUNT(*) as cnt FROM expense_category_main').get();
  if (mainCount.cnt === 0) {
    // 支出大类：衣食住行
    const insertMain = db.prepare('INSERT INTO expense_category_main (name, icon, sort_order) VALUES (?, ?, ?)');
    const mainCategories = [
      ['衣', '👕', 1],
      ['食', '🍽️', 2],
      ['住', '🏠', 3],
      ['行', '🚗', 4]
    ];
    const insertMany = db.transaction(() => {
      for (const m of mainCategories) {
        insertMain.run(m[0], m[1], m[2]);
      }
    });
    insertMany();

    // 支出二类
    const insertSub = db.prepare('INSERT INTO expense_category_sub (main_category_id, name, icon, sort_order) VALUES (?, ?, ?, ?)');
    const subCategories = [
      // 衣 (id=1)
      [1, '衣服', '👚', 1], [1, '鞋子', '👟', 2], [1, '包包', '👜', 3],
      [1, '配饰', '⌚', 4], [1, '化妆品', '💄', 5],
      // 食 (id=2)
      [2, '三餐', '🍚', 1], [2, '水果零食', '🍎', 2], [2, '外卖', '📦', 3],
      [2, '聚餐', '🍻', 4], [2, '买菜', '🥬', 5],
      // 住 (id=3)
      [3, '房租/房贷', '🏡', 1], [3, '水电燃气', '💡', 2], [3, '物业费', '🏢', 3],
      [3, '家居用品', '🛋️', 4], [3, '维修', '🔧', 5],
      // 行 (id=4)
      [4, '公交地铁', '🚌', 1], [4, '打车', '🚕', 2], [4, '加油', '⛽', 3],
      [4, '停车费', '🅿️', 4], [4, '保养维修', '🔩', 5], [4, '旅行', '✈️', 6]
    ];
    const insertSubMany = db.transaction(() => {
      for (const s of subCategories) {
        insertSub.run(s[0], s[1], s[2], s[3]);
      }
    });
    insertSubMany();

    // 收入分类：工资、副业、理财
    const insertIncome = db.prepare('INSERT INTO income_category (name, icon, sort_order) VALUES (?, ?, ?)');
    const incomeCategories = [
      ['工资', '💼', 1],
      ['副业', '💻', 2],
      ['理财', '📈', 3]
    ];
    const insertIncomeMany = db.transaction(() => {
      for (const i of incomeCategories) {
        insertIncome.run(i[0], i[1], i[2]);
      }
    });
    insertIncomeMany();
  }
}

initDefaultData();

// ==================== API 路由 ====================

// --- 支出大类 ---
app.get('/api/expense-main', (req, res) => {
  const rows = db.prepare('SELECT * FROM expense_category_main ORDER BY sort_order').all();
  res.json(rows);
});

app.post('/api/expense-main', (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as maxOrder FROM expense_category_main').get();
  const sortOrder = (maxOrder.maxOrder || 0) + 1;
  const result = db.prepare('INSERT INTO expense_category_main (name, icon, sort_order) VALUES (?, ?, ?)').run(name, icon || '📌', sortOrder);
  res.json({ id: result.lastInsertRowid, name, icon: icon || '📌', sort_order: sortOrder });
});

app.put('/api/expense-main/:id', (req, res) => {
  const { name, icon } = req.body;
  db.prepare('UPDATE expense_category_main SET name = ?, icon = ? WHERE id = ?').run(name, icon, req.params.id);
  res.json({ success: true });
});

app.delete('/api/expense-main/:id', (req, res) => {
  db.prepare('DELETE FROM expense_category_main WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- 支出二类 ---
app.get('/api/expense-sub', (req, res) => {
  const { main_id } = req.query;
  let rows;
  if (main_id) {
    rows = db.prepare(`
      SELECT es.*, em.name as main_name 
      FROM expense_category_sub es 
      JOIN expense_category_main em ON es.main_category_id = em.id 
      WHERE es.main_category_id = ? 
      ORDER BY es.sort_order
    `).all(main_id);
  } else {
    rows = db.prepare(`
      SELECT es.*, em.name as main_name 
      FROM expense_category_sub es 
      JOIN expense_category_main em ON es.main_category_id = em.id 
      ORDER BY em.sort_order, es.sort_order
    `).all();
  }
  res.json(rows);
});

app.post('/api/expense-sub', (req, res) => {
  const { main_category_id, name, icon } = req.body;
  if (!main_category_id || !name) return res.status(400).json({ error: '分类和名称不能为空' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as maxOrder FROM expense_category_sub WHERE main_category_id = ?').get(main_category_id);
  const sortOrder = (maxOrder.maxOrder || 0) + 1;
  const result = db.prepare('INSERT INTO expense_category_sub (main_category_id, name, icon, sort_order) VALUES (?, ?, ?, ?)').run(main_category_id, name, icon || '📌', sortOrder);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/expense-sub/:id', (req, res) => {
  const { name, icon, main_category_id } = req.body;
  db.prepare('UPDATE expense_category_sub SET name = ?, icon = ?, main_category_id = ? WHERE id = ?').run(name, icon, main_category_id, req.params.id);
  res.json({ success: true });
});

app.delete('/api/expense-sub/:id', (req, res) => {
  db.prepare('DELETE FROM expense_category_sub WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- 收入分类 ---
app.get('/api/income-category', (req, res) => {
  const rows = db.prepare('SELECT * FROM income_category ORDER BY sort_order').all();
  res.json(rows);
});

app.post('/api/income-category', (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: '名称不能为空' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as maxOrder FROM income_category').get();
  const sortOrder = (maxOrder.maxOrder || 0) + 1;
  const result = db.prepare('INSERT INTO income_category (name, icon, sort_order) VALUES (?, ?, ?)').run(name, icon || '💰', sortOrder);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/income-category/:id', (req, res) => {
  const { name, icon } = req.body;
  db.prepare('UPDATE income_category SET name = ?, icon = ? WHERE id = ?').run(name, icon, req.params.id);
  res.json({ success: true });
});

app.delete('/api/income-category/:id', (req, res) => {
  db.prepare('DELETE FROM income_category WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- 账单记录 ---
app.get('/api/records', (req, res) => {
  const { month, year, type } = req.query;
  let sql = `
    SELECT r.*, 
      em.name as main_category_name, em.icon as main_category_icon,
      es.name as sub_category_name, es.icon as sub_category_icon,
      ic.name as income_category_name, ic.icon as income_category_icon
    FROM records r
    LEFT JOIN expense_category_main em ON r.main_category_id = em.id
    LEFT JOIN expense_category_sub es ON r.sub_category_id = es.id
    LEFT JOIN income_category ic ON r.income_category_id = ic.id
    WHERE 1=1
  `;
  const params = [];

  if (month && year) {
    sql += ' AND strftime(\'%Y-%m\', r.record_date) = ?';
    params.push(`${year}-${String(month).padStart(2, '0')}`);
  } else if (year) {
    sql += ' AND strftime(\'%Y\', r.record_date) = ?';
    params.push(String(year));
  }
  if (type) {
    sql += ' AND r.type = ?';
    params.push(type);
  }
  sql += ' ORDER BY r.record_date DESC, r.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post('/api/records', (req, res) => {
  const { type, amount, main_category_id, sub_category_id, income_category_id, note, record_date } = req.body;
  if (!type || !amount || !record_date) return res.status(400).json({ error: '必填字段不能为空' });
  
  const result = db.prepare(`
    INSERT INTO records (type, amount, main_category_id, sub_category_id, income_category_id, note, record_date) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(type, amount, main_category_id || null, sub_category_id || null, income_category_id || null, note || '', record_date);
  
  const record = db.prepare('SELECT * FROM records WHERE id = ?').get(result.lastInsertRowid);
  
  // 检查预算
  checkBudget(record_date);
  
  res.json(record);
});

app.put('/api/records/:id', (req, res) => {
  const { type, amount, main_category_id, sub_category_id, income_category_id, note, record_date } = req.body;
  db.prepare(`
    UPDATE records SET type=?, amount=?, main_category_id=?, sub_category_id=?, income_category_id=?, note=?, record_date=?
    WHERE id=?
  `).run(type, amount, main_category_id || null, sub_category_id || null, income_category_id || null, note || '', record_date, req.params.id);
  checkBudget(record_date);
  res.json({ success: true });
});

app.delete('/api/records/:id', (req, res) => {
  const record = db.prepare('SELECT * FROM records WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id);
  if (record) checkBudget(record.record_date);
  res.json({ success: true });
});

// --- 统计 ---
app.get('/api/stats/monthly', (req, res) => {
  const { year } = req.query;
  if (!year) return res.status(400).json({ error: '年份不能为空' });
  
  const incomeStats = db.prepare(`
    SELECT strftime('%m', record_date) as month, SUM(amount) as total
    FROM records WHERE type='income' AND strftime('%Y', record_date)=?
    GROUP BY month ORDER BY month
  `).all(String(year));
  
  const expenseStats = db.prepare(`
    SELECT strftime('%m', record_date) as month, SUM(amount) as total
    FROM records WHERE type='expense' AND strftime('%Y', record_date)=?
    GROUP BY month ORDER BY month
  `).all(String(year));
  
  // 按大类的支出统计
  const expenseByMain = db.prepare(`
    SELECT em.name, em.icon, SUM(r.amount) as total
    FROM records r
    JOIN expense_category_main em ON r.main_category_id = em.id
    WHERE r.type='expense' AND strftime('%Y', r.record_date)=?
    GROUP BY em.id ORDER BY total DESC
  `).all(String(year));

  res.json({ incomeStats, expenseStats, expenseByMain });
});

app.get('/api/stats/yearly', (req, res) => {
  const incomeStats = db.prepare(`
    SELECT strftime('%Y', record_date) as year, SUM(amount) as total
    FROM records WHERE type='income' GROUP BY year ORDER BY year
  `).all();
  
  const expenseStats = db.prepare(`
    SELECT strftime('%Y', record_date) as year, SUM(amount) as total
    FROM records WHERE type='expense' GROUP BY year ORDER BY year
  `).all();
  
  res.json({ incomeStats, expenseStats });
});

app.get('/api/stats/month-detail', (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: '年月不能为空' });
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  
  // 按二类统计支出
  const expenseBySub = db.prepare(`
    SELECT es.name as sub_name, es.icon as sub_icon, em.name as main_name, em.icon as main_icon,
           SUM(r.amount) as total, COUNT(*) as count
    FROM records r
    JOIN expense_category_sub es ON r.sub_category_id = es.id
    JOIN expense_category_main em ON r.main_category_id = em.id
    WHERE r.type='expense' AND strftime('%Y-%m', r.record_date)=?
    GROUP BY es.id ORDER BY total DESC
  `).all(ym);

  // 按收入分类统计
  const incomeByCategory = db.prepare(`
    SELECT ic.name, ic.icon, SUM(r.amount) as total, COUNT(*) as count
    FROM records r
    JOIN income_category ic ON r.income_category_id = ic.id
    WHERE r.type='income' AND strftime('%Y-%m', r.record_date)=?
    GROUP BY ic.id ORDER BY total DESC
  `).all(ym);

  const totalIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM records WHERE type='income' AND strftime('%Y-%m', record_date)=?`).get(ym);
  const totalExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM records WHERE type='expense' AND strftime('%Y-%m', record_date)=?`).get(ym);

  res.json({ expenseBySub, incomeByCategory, totalIncome: totalIncome.total, totalExpense: totalExpense.total });
});

// --- 预算 ---
app.get('/api/budget', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: '月份不能为空(YYYY-MM)' });
  const row = db.prepare('SELECT * FROM budget WHERE month = ?').get(month);
  res.json(row || { month, amount: 0 });
});

app.post('/api/budget', (req, res) => {
  const { month, amount } = req.body;
  if (!month) return res.status(400).json({ error: '月份不能为空' });
  const existing = db.prepare('SELECT * FROM budget WHERE month = ?').get(month);
  if (existing) {
    db.prepare('UPDATE budget SET amount = ? WHERE month = ?').run(amount, month);
  } else {
    db.prepare('INSERT INTO budget (month, amount) VALUES (?, ?)').run(month, amount);
  }
  res.json({ month, amount });
});

// 检查预算是否超支
function checkBudget(recordDate) {
  const month = recordDate.substring(0, 7);
  const budget = db.prepare('SELECT amount FROM budget WHERE month = ?').get(month);
  if (budget && budget.amount > 0) {
    const totalExpense = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM records WHERE type='expense' AND strftime('%Y-%m', record_date)=?`).get(month);
    return { budget: budget.amount, spent: totalExpense.total, overBudget: totalExpense.total > budget.amount };
  }
  return null;
}

app.get('/api/budget/check', (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: '月份不能为空(YYYY-MM)' });
  const result = checkBudget(month + '-01');
  res.json(result || { budget: 0, spent: 0, overBudget: false });
});

// ==================== 启动服务 ====================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`记账软件已启动: http://localhost:${PORT}`);
  console.log(`手机访问: http://你的电脑IP:${PORT}`);
});
