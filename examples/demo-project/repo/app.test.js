const assert = require('node:assert');
const { add, toCsv } = require('./app.js');

assert.strictEqual(add(2, 3), 5);

// PRJ-777: шаг TDD — сначала этот тест красный (toCsv не существовал),
// затем правка app.js делает его зелёным.
assert.strictEqual(toCsv([[1, 2], [3, 4]]), '1;2\n3;4');

console.log('OK: 2 теста зелёные (add, toCsv)');
