# Реестр

## [default]
project: calc

## calc
jiraKey: PRJ
repoSsh: git@git.corp:team/calc.git
ce: CALC-APP
branchDefault: main
runLimit.build: 3
runLimit.deploy: 2
retryLimit: 1
runBudget: 90
errorPolicy.notFixable: infra, sonar
mcp-build.server: jenkins-conf
mcp-build.job.path: folder/team
mcp-build.job.name: calc-app
mcp-deploy.server: jenkins-conf
mcp-deploy.job.path: folder/team
mcp-deploy.job.name: calc-app-deploy
deploy.stands: DEV, ST, IFT, PSI
mcp-sonar.server: sonar-corp
mcp-sonar.projectKey: corp-calc
mcp-jira.server: jira-corp
mcp-confluence.server: confluence-corp
mcp-bitbucket.server: bitbucket-corp
