/*
 * (C) Copyright 2017 Nuxeo (http://nuxeo.com/) and others.
 *
 * Contributors:
 *     Thomas Roger <troger@nuxeo.com>
 */

 properties([
    pipelineTriggers([
        triggers: [
            [
                $class: 'ReverseBuildTrigger',
                upstreamProjects: "${env.UPSTREAM_PROJECT}", threshold: hudson.model.Result.SUCCESS
            ]
        ]
    ])
 ])

def formatSlack(begin) {
  return "${begin} <${currentBuild.absoluteUrl}|${env.JOB_NAME}>";
}

def archive_paths = 'ftest/target/tomcat/log/*.log, ftest/target/js-reports/*.xml, ftest/target/screenshots/*, ftest/target/wdio/*'

node(env.SLAVE) {
    try {
        timestamps {
            timeout(30) {
                stage('checkout') {
                    // manually clean before checkout
                    sh """
                        if git rev-parse --git-dir > /dev/null 2>&1; then
                            git clean -fdx
                        fi
                    """

                    checkout scm
                }

                stage ('build and test') {
                    step([$class: 'GitHubCommitStatusSetter',
                        reposSource: [$class: 'ManuallyEnteredRepositorySource', url: 'https://github.com/nuxeo/nuxeo-chrome-extension'],
                        contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: "${env.STATUS_CONTEXT_NAME}"],
                        statusResultSource: [$class: 'ConditionalStatusResultSource',
                        results: [[$class: 'AnyBuildResult', message: 'Building on Nuxeo CI', state: 'PENDING']]]])

                    def jdk = tool name: 'java-8-oracle'
                    env.JAVA_HOME = "${jdk}"
                    def mvnHome = tool name: 'maven-3.3', type: 'hudson.tasks.Maven$MavenInstallation'
                    sh "${mvnHome}/bin/mvn clean verify -f ${env.POM_PATH}"
                }

                stage ('post build') {
                    step([$class: 'WarningsPublisher', canComputeNew: false, canResolveRelativePaths: false,
                        consoleParsers: [[parserName: 'Maven']], defaultEncoding: '', excludePattern: '',
                        healthy: '', includePattern: '', messagesPattern: '', unHealthy: ''])
                    step([$class: 'CucumberReportPublisher', jsonReportDirectory: 'ftest/target/cucumber-reports/', fileIncludePattern: '*.json'])
                    archive "${archive_paths}"
                    // TODO cobertura coverage
                    junit 'ftest/target/js-reports/*.xml'
                    if (env.BRANCH_NAME == 'master') {
                        step([$class: 'JiraIssueUpdater', issueSelector: [$class: 'DefaultIssueSelector'], scm: scm])
                    }
                    if(currentBuild.getPreviousBuild() != null && 'SUCCESS' != currentBuild.getPreviousBuild().getResult()) {
                        mail (to: 'ecm@lists.nuxeo.com', subject: "${env.JOB_NAME} (${env.BUILD_NUMBER}) - Back to normal",
                            body: "Build back to normal: ${env.BUILD_URL}.")
                    }
                    step([$class: 'GitHubCommitStatusSetter',
                        reposSource: [$class: 'ManuallyEnteredRepositorySource', url: 'https://github.com/nuxeo/nuxeo-chrome-extension'],
                        contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: "${env.STATUS_CONTEXT_NAME}"],
                        statusResultSource: [$class: 'ConditionalStatusResultSource',
                        results: [[$class: 'AnyBuildResult', message: 'Successfully built on Nuxeo CI', state: 'SUCCESS']]]])

                    def color = currentBuild.result == null ? '#5FB404' : '#FE9A2E';
                    def status = currentBuild.result == null ? 'SUCCESS' : currentBuild.result;
                    slackSend color: color, channel: "${env.SLACK_CHANNEL}", message: formatSlack(status)
                }
            }
        }
    } catch(e) {
        currentBuild.result = "FAILURE"
        step([$class: 'ClaimPublisher'])
        archive "${archive_paths}"

        mail (to: 'ecm@lists.nuxeo.com', subject: "${env.JOB_NAME} (${env.BUILD_NUMBER}) - Failure!",
            body: "Build failed ${env.BUILD_URL}.")
        step([$class: 'GitHubCommitStatusSetter',
            reposSource: [$class: 'ManuallyEnteredRepositorySource', url: 'https://github.com/nuxeo/nuxeo-chrome-extension'],
            contextSource: [$class: 'ManuallyEnteredCommitContextSource', context: "${env.STATUS_CONTEXT_NAME}"],
            statusResultSource: [$class: 'ConditionalStatusResultSource',
            results: [[$class: 'AnyBuildResult', message: 'Failed to build on Nuxeo CI', state: 'FAILURE']]]])
        slackSend color: '#FF4000', channel: "${env.SLACK_CHANNEL}", message: formatSlack('FAILURE') + " ```${e.message}```"
        throw e
    } finally {
        step([$class: 'CheckStylePublisher', canComputeNew: false, defaultEncoding: '', healthy: '',
            pattern: 'ftest/target/checkstyle-result.xml', unHealthy: ''])
    }
}
