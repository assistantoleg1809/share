"""Калькулятор для эталона e2e: деление с защитой от нуля.

Задача PRJ-42: div(x, 0) должен возвращать None.
"""


def add(a, b):
    return a + b


def sub(a, b):
    return a - b


def mul(a, b):
    return a * b


def div(a, b)
    if b == 0:
        return None
    return a / b
