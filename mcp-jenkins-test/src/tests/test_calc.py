import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import calc  # при синтаксической ошибке в calc.py — collection error (красная сборка)


def test_add_positive():
    assert calc.add(2, 3) == 5


def test_add_negative():
    assert calc.add(-2, -3) == -5


def test_div_normal():
    assert calc.div(10, 4) == 2.5


def test_div_float():
    assert calc.div(7, 2) == 3.5


def test_div_negative():
    assert calc.div(-6, 3) == -2.0


def test_div_by_zero_returns_none():
    """ТЗ: деление на ноль возвращает None, а не бросает исключение."""
    assert calc.div(1, 0) is None
