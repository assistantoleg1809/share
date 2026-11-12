## [default]
project: calc

## calc
jiraKey: PRJ
repoSsh: git@localhost:e2e/bare.git
ce: CALC-E2E
branchDefault: main
runLimit.build: 3
runLimit.deploy: 2
retryLimit: 1
errorPolicy.notFixable: infra
knowledge: jenkins
mcp-build.server: jenkins
mcp-build.job.path: e2e
mcp-build.job.name: calc-app
mcp-deploy.server: jenkins
mcp-deploy.job.path: e2e
mcp-deploy.job.name: calc-app-deploy
deploy.stands: IFT, PSI
mcp-sonar.server: sonar
mcp-sonar.projectKey: calc
mcp-jira.server: jira
mcp-confluence.server: confluence
mcp-bitbucket.server: bitbucket
