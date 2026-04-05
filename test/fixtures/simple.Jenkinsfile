pipeline {
  agent any
  stages {
    stage('Build') {
      steps {
        sh 'mvn clean package'
        archiveArtifacts artifacts: '**/target/*.jar'
      }
    }
    stage('Test') {
      steps {
        sh 'mvn test'
        junit '**/target/surefire-reports/*.xml'
      }
    }
    stage('Deploy') {
      steps {
        sh './deploy.sh'
        echo 'Deployment complete'
      }
    }
  }
  post {
    failure {
      echo 'Build failed!'
    }
    always {
      cleanWs()
    }
  }
}
