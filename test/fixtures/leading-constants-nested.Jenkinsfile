// Regression fixture: declarative pipeline preceded by comments + top-level
// Groovy constants, with nested `stages { }` blocks and stage names containing
// parentheses. Covers the two bugs that made real Jenkinsfiles render empty:
//   1. detectMode() was anchored to the file start → mis-detected 'scripted'
//   2. buildStageNodes() did not recurse into nested stages {} → only top-level stages
//   3. extractLastKeyword() broke on stage('Name (x)') → stage skipped

IMAGE_MAP = [
    'web' : 'web/Dockerfile',
    'bot' : 'docker/images/bot/Dockerfile',
]

pipeline {
    agent any
    stages {
        stage('Sync Sources') {
            steps {
                sh 'git fetch'
                echo 'synced'
            }
        }
        stage('Build Lock') {
            stages {
                stage('Gate disque') {
                    when { anyOf { branch 'dev'; branch 'master' } }
                    steps { script { def x = 1 } }
                }
                stage('Staging') {
                    stages {
                        stage('Free RAM (staging)') {
                            steps { script { echo 'ok' } }
                        }
                        stage('Build images') {
                            steps { sh 'make' }
                        }
                    }
                }
                stage('Dev') {
                    stages {
                        stage('Deploy (dev)') {
                            steps { sh './deploy.sh' }
                        }
                    }
                }
            }
        }
        stage('Master') {
            stages {
                stage('Deploy (prod)') {
                    steps { sh './prod.sh' }
                }
            }
        }
    }
    post {
        always {
            cleanWs()
        }
    }
}
