Готово — собран каталог из ~17 проектов и сделан глубокий разбор победителя. Вот обзор.

# Jenkins MCP-серверы в open source: каталог + обзор лидера

Все цифры сняты 2026-11-27 с GitHub API, npm/PyPI registry API и pepy.tech — не из поисковых сниппетов.

## Каталог: кто есть на рынке

| ★ | Проект | Суть |
|--:|---|---|
| 164 | lanbaoshen/mcp-jenkins (Python, MIT) | Победитель — standalone-сервер, 34 инструмента, PyPI 184k загрузок |
| 121 | jenkinsci/mcp-server-plugin (Java, MIT) | Официальный плагин в org jenkinsci: Jenkins сам становится MCP-сервером; самый активный (пуш 2026-11-26, 81 форк) |
| 32 | Jordan-Jarvis/jenkins-mcp-enterprise | Мульти-инстанс, downstream-дерево, диагностика падений, Qdrant semantic search |
| 19 | kud/mcp-jenkins (TS) | 39 инструментов; лидер по usage — npm @kud/mcp-jenkins, 17k скач./мес при 19★ |
| 15 | hekmon8/Jenkins-server-mcp | Самый ранний (2024-12), README не читается |
| 14 | AshwiniGhuge3012/jenkins-mcp-server | Folder-поддержка, стриминг консоли, артефакты |
| 10 | kjozsa/jenkins-mcp | PyPI, CSRF crumb, карточки Smithery/Glama |
| 5–2 | truxt-ai, jenkins-mcp-go (Go), grglzrv (Reo-policy), mcpland | Ниши: Go-бинарь с flaky-тестами; secure-by-design; 23 инструмента + read-only |

Вне GitHub: npm-пакеты с 200–800 скач./мес (@mister-good-deal/host-mcp-jenkins — плагин-функциональность без плагина, @martin4455/jenkins-mcp-ro — read-only с keyring, @znmin/jenkins-mcp-server — Pipeline Replay).

Победитель по звёздам — lanbaoshen/mcp-jenkins. Оговорка: официальный плагин отстаёт всего на 43★, но растёт быстрее.

## Обзор: lanbaoshen/mcp-jenkins

### Что это

Standalone MCP-сервер на Python, который подключает AI-агента (Claude, Copilot, Qwen и любой MCP-клиент) к Jenkins через REST API. Проект-однодневка автора lanbaoshen, выросший в самый популярный инструмент ниши: создан 2025-04-02, первый релиз 0.1.0 в тот же день, с тех пор 30 релизов за 20 месяцев, последний пуш 2026-11-16.

| Метрика | Значение (2026-11-27) |
|---|---|
| GitHub | 164★, 76 форков, 15 открытых issues+PR, MIT |
| PyPI | mcp-jenkins v3.6.0 (2026-10-13), python ≥ 3.11 |
| Загрузки | 184 103 всего, 18 331 за 30 дней (~960/сутки) |
| Контрибьюторы | 15+ внешних, мержи GPG-подписанные |
| Тесты | ~195 юнит-тестов + codecov + интеграционный тест Docker-образа |

### Архитектура

MCP-фреймворк — fastmcp ≥ 3; кликовский CLI; точка входа mcp-jenkins.

python-jenkins не используется — самописный клиент на requests (rest_client.py + Pydantic-модели item/build/node/queue). Это даёт компактные, отфильтрованные ответы вместо сырого JSON Jenkins.

Версионная политика необычная: мажор пакета = мажор fastmcp (прыжок 1.x → 3.0.0 в феврале 2026 — это синхронизация с fastmcp 3, а не мажорный слом проекта).

### Полный набор инструментов — 34

| Секция | Инструменты |
|---|---|
| Jobs (6) | get_item, get_item_config, get_item_parameters, get_all_items, query_items (поиск + folder_depth), build_item (запуск, вкл. мультиконфигурационные) |
| Nodes (3) | get_all_nodes, get_node, get_node_config |
| Queue (3) | get_all_queue_items, get_queue_item, cancel_queue_item |
| Builds (13) | get_build, get_build_scripts, get_build_console_output (paging: pattern/offset/limit), get_build_parameters, get_build_test_report, get_build_test_failures, get_running_builds, stop_build, get_pending_inputs, submit_input, get_all_build_artifacts, get_build_artifact, get_build_artifact_url |
| Views (2) | get_view, get_all_views |
| Plugins (6) | get_all_plugins, get_plugin, get_plugins_with_problems, get_plugins_with_backup, get_plugins_with_updates, get_plugin_dependency_graph (Graphviz) |
| Script (1) | run_groovy_script — произвольный Groovy на сервере Jenkins |

### Установка и конфигурация

```bash
uvx mcp-jenkins          # рекомендуемый способ
pip install mcp-jenkins
docker run ghcr.io/lanbaoshen/mcp-jenkins   # multi-arch amd64/arm64, non-root
```

Конфиг — три источника с приоритетом CLI-флаги → env → .env: JENKINS_URL, JENKINS_USERNAME, JENKINS_PASSWORD, JENKINS_TIMEOUT, JENKINS_VERIFY_SSL. Полезные флаги: --read-only, --transport stdio|sse|streamable-http, --port 9887. С v3.6.0 работает даже без кредов (анонимный доступ), а в HTTP-транспорте креды можно передавать заголовками x-jenkins-* (ASGI-middleware — удобно для мульти-клиентских развёртываний). Для k8s есть liveness-эндпоинт GET /healthz.

Из зависимостей Jenkins: для get_pending_inputs нужен plugin pipeline-rest-api, для submit_input без input_id — pipeline-input-step. Поддерживаемые версии Jenkins не зафиксированы — сервер ходит через универсальный REST + wfapi.

### Сильные стороны

Дисциплина разработки выше среднего по нише: 30 релизов, ~195 тестов, codecov, pre-commit/ruff, dependabot, multi-stage Docker, автосинк версии ботом. В репо есть AGENTS.md — проект сам ориентирован на AI-агентов-контрибьюторов (часть свежих PR помечена «Generated with Claude Code»).

Экономия контекста агента — главная ценность против голого REST: paging логов по паттерну, отдельный инструмент только упавших тестов, dependency-граф плагинов, компактные Pydantic-модели.

Гибкая эксплуатация: три транспорта, read-only режим, HTTP-auth через заголовки, healthz, Docker multi-arch.

### Ограничения и риски

run_groovy_script — опасный инструмент (полный доступ к контроллеру). Обязательно запускать с --read-only в недоверенных контурах — но проверяйте: read-only режет только инструменты с тегом write, Groovy-инструмент стоит держать под отдельной политикой.

Запись в Jenkins ограничена: создать/скопировать job нельзя — create_item/copy_item только в очереди (PR #119, ноябрь 2026). Это сервер «читай, запускай, разбирай падения», а не «настраивай».

Никаких гарантий совместимости с версиями Jenkins; логи каталогов (mcp.so) отстают от реальности — сверяйтесь с README.

## Когда что выбирать

| Сценарий | Выбор |
|---|---|
| Подключить агента к существующему Jenkins без правок на сервере | lanbaoshen/mcp-jenkins (uvx одной строкой) |
| Контролируемый enterprise-Jenkins, можно ставить плагины | jenkinsci/mcp-server-plugin — официальный, без отдельного процесса |
| Максимальное покрытие API, TS-стек | kud/mcp-jenkins (39 инструментов) |
| Мульти-инстанс + авто-диагностика падений | Jordan-Jarvis/jenkins-mcp-enterprise |

## Источники

- GitHub API: api.github.com/repos/lanbaoshen/mcp-jenkins (+ /tags, /releases, /commits, дерево master)
- README: raw.githubusercontent.com/lanbaoshen/mcp-jenkins/HEAD/README.md
- PyPI: pypi.org/pypi/mcp-jenkins/json; загрузки — pepy.tech/projects/mcp-jenkins
- Docker: docker/DOCKER.md, .github/workflows/docker-publish.yaml
- Каталоги: mcp.so/server/mcp-jenkins/lanbaoshen, mcpservers.org/servers/lanbaoshen/mcp-jenkins

Прямых блог-обзоров проекта не нашлось (Bing на узких запросах деградировал — выборка построена на прямых API)
