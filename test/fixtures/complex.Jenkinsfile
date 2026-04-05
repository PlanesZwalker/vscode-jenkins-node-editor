pipeline {
  agent none
  options {
    timeout(time: 1, unit: 'HOURS')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }
  parameters {
    string(name: 'TARGET_ENV', defaultValue: 'staging', description: 'Deploy target')
    booleanParam(name: 'RUN_INTEGRATION', defaultValue: true, description: 'Run integration tests')
    choice(name: 'LOG_LEVEL', choices: ['INFO', 'DEBUG', 'WARN'], description: 'Log level')
  }
  triggers {
    cron('H */4 * * 1-5')
  }
  environment {
    DOCKER_REGISTRY = 'registry.example.com'
    APP_NAME = 'my-app'
    VERSION = "${BUILD_NUMBER}"
  }
  stages {
    stage('Build') {
      agent { label 'docker' }
      steps {
        sh 'docker build -t ${DOCKER_REGISTRY}/${APP_NAME}:${VERSION} .'
      }
    }
    stage('Test') {
      agent { label 'docker' }
      steps {
        sh 'docker run --rm ${DOCKER_REGISTRY}/${APP_NAME}:${VERSION} npm test'
        junit 'test-results/*.xml'
      }
    }
    stage('Push') {
      agent { label 'docker' }
      when {
        anyOf {
          branch 'main'
          branch 'develop'
        }
      }
      steps {
        withCredentials([usernamePassword(credentialsId: 'docker-registry', usernameVariable: 'USER', passwordVariable: 'PASS')]) {
          sh 'docker login -u $USER -p $PASS ${DOCKER_REGISTRY}'
          sh 'docker push ${DOCKER_REGISTRY}/${APP_NAME}:${VERSION}'
        }
      }
    }
    stage('Deploy') {
      agent { label 'deploy' }
      when {
        environment name: 'TARGET_ENV', value: 'production'
      }
      steps {
        timeout(time: 10, unit: 'MINUTES') {
          sh './scripts/deploy.sh ${TARGET_ENV} ${VERSION}'
        }
        retry(3) {
          sh './scripts/healthcheck.sh'
        }
      }
    }
  }
  post {
    success {
      echo 'Pipeline succeeded!'
    }
    failure {
      mail to: 'team@example.com',
           subject: "FAILED: Pipeline '${currentBuild.fullDisplayName}'",
           body: "Build URL: ${currentBuild.absoluteUrl}"
    }
    always {
      cleanWs()
    }
  }
}
