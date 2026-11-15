// calc — учебное приложение demo-project (мини-репозиторий проекта)
function add(a, b) {
  return a + b;
}

// PRJ-777: экспорт результатов в CSV (разделитель «;», строки без заголовка)
function toCsv(rows) {
  return rows.map((r) => r.join(';')).join('\n');
}

module.exports = { add, toCsv };
