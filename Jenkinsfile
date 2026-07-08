/**
 * Jenkins pipeline for LibreChat a11y Playwright tests.
 *
 * Runs: npm run e2e:a11y:ci
 *   → e2e/specs/a11y.spec.ts with e2e/playwright.config.ts
 *
 * Local headed run (needs e2e/config.local.ts from config.local.example.ts):
 *   npm run e2e:a11y
 *   → same file with e2e/playwright.config.a11y.ts
 *
 * Env secrets are inlined in the environment block below (not Jenkins credentials store).
 * Adjust E2E_USER_* / MONGO_URI if your agent Mongo host differs.
 * Agent notes:
 * - Node.js 20.x recommended
 * - MongoDB must be reachable via MONGO_URI
 * - Xvfb needed because authenticate.ts launches Chromium with headless: false
 */

pipeline {
  agent any

  tools {
    nodejs 'Node 20'
  }

  options {
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  environment {
    CI = 'true'
    NODE_ENV = 'CI'
    SEARCH = 'false'
    TITLE_CONVO = 'false'
    ALLOW_REGISTRATION = 'true'
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
    PLAYWRIGHT_BROWSERS_PATH = '0'
    DOMAIN_CLIENT = 'http://localhost:3080'
    DOMAIN_SERVER = 'http://localhost:3080'
    BINGAI_TOKEN = 'user_provided'
    CHATGPT_TOKEN = 'user_provided'

    MONGO_URI = 'mongodb://127.0.0.1:27017/LibreChat'
    E2E_USER_EMAIL = 'testuser@example.com'
    E2E_USER_PASSWORD = 'securepassword123'
    JWT_SECRET = '16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef'
    JWT_REFRESH_SECRET = 'eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418'
    CREDS_KEY = 'f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0'
    CREDS_IV = 'e2341419ec3dd3d19b13a1a87fafcbfb'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup Node') {
      steps {
        sh '''
          set -e
          node -v
          npm -v
        '''
      }
    }

    stage('Install dependencies') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Build frontend (dist)') {
      steps {
        sh 'npm run frontend'
      }
    }

    stage('Install Playwright Chromium') {
      steps {
        sh '''
          set -e
          npx playwright install-deps chromium || true
          npx playwright install chromium
        '''
      }
    }

    stage('Run a11y e2e') {
      steps {
        // Uses existing e2e/playwright.config.ts; only a11y.spec.ts
        sh '''
          set -e
          if command -v xvfb-run >/dev/null 2>&1; then
            xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" npm run e2e:a11y:ci
          else
            echo "WARNING: xvfb-run not found; authenticate.ts launches headed Chromium and may fail."
            npm run e2e:a11y:ci
          fi
        '''
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'e2e/playwright-report/**', allowEmptyArchive: true, fingerprint: true
      archiveArtifacts artifacts: 'e2e/specs/.test-results/**', allowEmptyArchive: true, fingerprint: true

      catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
        publishHTML([
          allowMissing: true,
          alwaysLinkToLastBuild: true,
          keepAll: true,
          reportDir: 'e2e/playwright-report',
          reportFiles: 'index.html',
          reportName: 'Playwright A11y Report'
        ])
      }
    }

    cleanup {
      sh 'rm -f e2e/storageState.json || true'
    }
  }
}
