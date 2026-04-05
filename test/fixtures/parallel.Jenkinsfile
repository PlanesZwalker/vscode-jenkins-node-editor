pipeline {
  agent any
  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Tests') {
      parallel {
        stage('Unit Tests') {
          agent { label 'linux' }
          steps {
            sh 'npm test'
            junit 'test-results/**/*.xml'
          }
        }
        stage('Integration Tests') {
          agent { docker { image 'node:18-alpine' } }
          steps {
            sh 'npm run test:integration'
          }
        }
        stage('Lint') {
          steps {
            sh 'npm run lint'
          }
        }
      }
    }
    stage('Build') {
      steps {
        sh 'npm run build'
        archiveArtifacts artifacts: 'dist/**'
      }
    }
  }
}
