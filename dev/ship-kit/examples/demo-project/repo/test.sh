#!/usr/bin/env bash
# Локальный прогон тестов calc — тот же шаг, что в Jenkins-джобе calc-app.
set -u
cd "$(dirname "$0")"
exec node app.test.js
