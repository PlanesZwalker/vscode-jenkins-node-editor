pipeline {
  agent any
  stages {
    stage('Build') {
      steps {
        checkout([$class: 'GitSCM', branches: [[name: '*/main']],
                   userRemoteConfigs: [[url: 'git@example.com:repo.git']]])
        sh '''
          set -e
          echo "multi-line"
          docker build -t app:${VERSION} .
        '''
        script {
          def tag = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.TAG = tag
        }
        echo 'done'
      }
    }
  }
}
