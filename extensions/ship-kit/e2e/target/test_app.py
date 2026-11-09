import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app import add, div


def test_add():
    assert add(2, 3) == 5


def test_div():
    assert div(10, 2) == 5.0


def test_div_by_zero_returns_none():
    assert div(1, 0) is None
