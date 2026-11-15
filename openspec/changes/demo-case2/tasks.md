# Tasks

## 1. Стенд кейса-2

- [x] 1.1 Написать `make_sandbox2.mjs`: сид-репо (app.js с add,
  Jenkinsfile с опечаткой STAND_HOS, тест add), копия openspec-скиллов
  (`.agents/skills/openspec-*`) в песочницу, файл проектов с
  конвенциями спеки (openspec-скилл + имя `<сторь>-<slug>`,
  применяются без промпта), моки (jira PRJ-705/PRJ-888 с ловушкой «до
  целых», build ['FAIL_TEST','SUCCESS'], deploy IFT
  ['FAIL_JENKINSCFG','SUCCESS'], логи FAIL_TEST/FAIL_JENKINSCFG,
  confluence «стандарт платформы — 2 знака», autoMerge=false);
  проверить: сборка проходит, `ls <sb>/.agents/skills` содержит
  openspec-*, смоук моков (FAIL_TEST → SUCCESS, FAIL_JENKINSCFG →
  SUCCESS, get_issue parent) зелёный
- [x] 1.2 Написать `SCENARIO-2.md`: где запускать (песочница,
  пересборка), что вводить — 13 сообщений одной сессии + однострочные
  служебные команды (замечание, MERGED×3) + ожидаемые артефакты;
  проверить: все команды однострочные, промпт вызова 1 не содержит ни
  слова о спеке/правилах

## 2. Приёмка стенда

- [x] 2.1 Смоук песочницы (без живого прогона — его запускает
  пользователь): моки отвечают, скиллы на месте, git init есть;
  `openspec validate demo-case2 --strict` зелёный; коммит (test:
  стенд кейса-2) вместе с архивацией demo-live-run; проверить:
  `git status` чист
