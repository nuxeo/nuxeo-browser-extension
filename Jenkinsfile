/*
 * (C) Copyright 2021 Nuxeo (http://nuxeo.com/) and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Contributors:
 *     Nuxeo
 */

def volumeName = env.JOB_NAME.replaceAll('/','-').toLowerCase()

def pullRequestLabels = []

def containerScript = ""

bootstrapTemplate = readTrusted('Jenkinsfile-pod.yaml')
env.setProperty('POD_TEMPLATE', bootstrapTemplate)

pipeline {
    options {
        skipDefaultCheckout()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(daysToKeepStr: '60', numToKeepStr: '60', artifactNumToKeepStr: '1'))
    }
    agent {
        kubernetes {
            yamlMergeStrategy override()
            yaml "${POD_TEMPLATE}"
            defaultContainer 'maven'
        }
    }
    environment {
        ORG = 'nuxeo'
        APP_NAME = 'nuxeo-browser-extension'
    }
    stages {
        stage('Prepare workspace') {
            steps {
                container('jnlp') {
                    script {
                        def scmvars = checkout scm: [
                            $class: 'GitSCM',
                            branches: scm.branches,
                            doGenerateSubmoduleConfigurations: false,
                            extensions: [[$class: 'LocalBranch', localBranch: '**'],
                                         [$class: 'CloneOption', noTags: false],
                                         [$class: 'SubmoduleOption',
                                          disableSubmodules: false,
                                          parentCredentials: true,
                                          recursiveSubmodules: true,
                                          reference: '',
                                          trackingSubmodules: false]],
                            submoduleCfg: [],
                            userRemoteConfigs: scm.userRemoteConfigs
                        ]
                        scmvars.each { key, val -> env.setProperty(key, val) }
                    }
                }
                container('maven') {
                    sh 'rm -fr .tmp && make workspace'
                }
            }
        }
        stage('Install, run lint and build') {
            steps {
                gitStatusWrapper(credentialsId: 'pipeline-git-github',
                                         gitHubContext: 'install-lint-build',
                                         description: 'install, run lint and build',
                                         successDescription: 'install, run lint and build',
                                         failureDescription: 'install, run lint and build failed') {
                    container('maven') {
                        sh "make install-and-build"
                    }
                }
            }
        }
        stage('Run tests') {
            steps {
                gitStatusWrapper(credentialsId: 'pipeline-git-github',
                                         gitHubContext: 'run-tests',
                                         description: 'run tests',
                                         successDescription: 'run tests',
                                         failureDescription: 'run tests failed') {
                    container('maven') {
                        sh "make test"
                    }
                }
            }
        }
    }
}

def notifyIfMaster() {
  if (BRANCH_NAME != 'master') {
    return
  }
  step([$class: 'JiraIssueUpdater', issueSelector: [$class: 'DefaultIssueSelector'], scm: scm])
}
