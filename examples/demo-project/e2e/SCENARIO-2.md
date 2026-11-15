# SCENARIO-2 — кейс: замечание на PR → CI-тесты ❌ → Jenkins-конфиг ❌

Прогон запускаете **вы сами**. С версии autochain-plan фазы идут по
плану **без остановки** (план создаётся всегда, дефолт task → pr → ci):
ваше участие — карточки-гейты («да») и служебные инъекции; сообщения
сессии ниже сводятся к пусковому и одиночным вызовам фиксов. Правила спеки (openspec-скилл, имя
`<сторь>-<slug>`) уже в файле проектов песочницы — в сообщениях сессии
их НЕ называть. Карточки гейтов подтверждаете лично («да»). Модель —
только glm-5.3-flash.

## ГДЕ

Пересборка песочницы (если нужно заново):

`node /Users/oleg/projects/share/examples/demo-project/e2e/make_sandbox2.mjs`

(напечатает путь; далее `<SB>` — этот путь). Запуск сессии — вторым
окном:

`cd <SB> && qwen --model glm-5.3-flash`

Служебные команды (второе окно, cwd = `<SB>`) — одной строкой, строго
по месту в сценарии.

## ЧТО — сообщения сессии по порядку

**Фаза задачи (спека — сама, по правилам проекта):**

1. `/ship-kit:task PRJ-888 добавь округление суммы в отчёте.`
2. `/ship-kit:pr отправь на ревью.` → карточка: **да** → PR-1 OPEN
   (мок не мержит сам).

Инъекция замечания ревьюера (второе окно):

`node -e "const f='./mcp-state.json',s=JSON.parse(require('fs').readFileSync(f));s.bitbucket.prs[1].comments.push({id:1,text:'total([]) падает? Верни 0 для пустого массива — требование PRJ-705'});require('fs').writeFileSync(f,JSON.stringify(s,null,1))"`

3. `/ship-kit:pr проверь PR.` → видно замечание
4. `/ship-kit:task PRJ-888 исправь по замечанию ревью (PR-1 открыт).`
5. `/ship-kit:pr закрой замечания PR-1.` → карточка: **да**

MERGED после резолва (второе окно):

`node -e "const f='./mcp-state.json',s=JSON.parse(require('fs').readFileSync(f));s.bitbucket.prs[1].state='MERGED';require('fs').writeFileSync(f,JSON.stringify(s,null,1))"`

**CI — тесты (ловушка «до целых» vs «2 знака»):**

6. `/ship-kit:ci запусти сборку.` → карточка: **да** → FAIL_TEST,
   диагноз RELATED: task-diff
7. `/ship-kit:task PRJ-888 исправь по диагнозу; прежний PR MERGED — отдельной веткой от main.`
8. `/ship-kit:pr отправь фикс.` → **да** → PR-2

MERGED PR-2: `node -e "const f='./mcp-state.json',s=JSON.parse(require('fs').readFileSync(f));s.bitbucket.prs[2].state='MERGED';require('fs').writeFileSync(f,JSON.stringify(s,null,1))"`

9. `/ship-kit:ci повтори сборку.` → **да** → SUCCESS

**CI — конфиг Jenkins (посторонний, вне диффа задачи):**

10. `/ship-kit:ci запусти деплой IFT.` → **да** → FAIL_JENKINSCFG,
    диагноз config / RELATED: external
11. `/ship-kit:task PRJ-888 тех-фикс по диагнозу: конфиг Jenkins в репо, отдельной веткой от main, спеку не трогать.`
12. `/ship-kit:pr отправь тех-фикс.` → **да** → PR-3 (тех)

MERGED PR-3: `node -e "const f='./mcp-state.json',s=JSON.parse(require('fs').readFileSync(f));s.bitbucket.prs[3].state='MERGED';require('fs').writeFileSync(f,JSON.stringify(s,null,1))"`

13. `/ship-kit:ci повтори деплой IFT.` → **да** → SUCCESS — конец.

## Ожидаемые артефакты (сверка после прогона)

- спека: `openspec/changes/PRJ-705-<slug задачи>/` (proposal/tasks) —
  имя и инструмент — из правил проекта, без слов в промпте;
- ветки: feature/PRJ-888 (+ fixci/bugfix от main ×2), PR-1/2/3 MERGED
  в state мока; замечание закрыто resolve;
- jenkins: build FAIL_TEST → SUCCESS; deploy IFT FAIL_JENKINSCFG →
  SUCCESS; `skill-runs/PRJ-888/plan.md` — весь прогон;
- тех-фикс Jenkinsfile (STAND_HOS → DEPLOY_HOST/STAND_HOST) — артефакты
  спеки не тронуты.

Отклонения фиксируйте как есть — сессия/план отдаются на анализ
(RUN-2.md наполнится по факту).
