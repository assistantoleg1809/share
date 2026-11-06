"""calc — таргет-мини-проект эталона mcp-jenkins-test.

Инжектированные баги для build-fix-loop (PLAN.md §3.3):
  БАГ-1 (компиляция): у div пропущено двоеточие — сборка #1 падает;
       фикстура mcp/fixtures/build-compile-error.log указывает на строку 14.
  БАГ-2 (логика): после фикса синтаксиса вскрывается отсутствие обработки
       деления на ноль: тесты ждут None (см. tests/test_calc.py).
"""


def add(a, b):
    return a + b

def div(a, b)
    return a / b
