module.exports = {
  // Use jsdom-like environment isn't needed — node is fine for pure function tests
  testEnvironment: 'node',

  // Transform ES modules to CommonJS via Babel
  transform: {
    '^.+\\.js$': 'babel-jest'
  },

  // Don't skip node_modules transforms (Firebase CDN imports get mapped anyway)
  transformIgnorePatterns: [],

  // Map Firebase CDN URLs and local config imports to our mocks
  moduleNameMapper: {
    // Firebase CDN imports → local mocks
    'https://www.gstatic.com/firebasejs/.*/firebase-firestore.js': '<rootDir>/tests/__mocks__/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/.*/firebase-auth.js': '<rootDir>/tests/__mocks__/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/.*/firebase-app.js': '<rootDir>/tests/__mocks__/firebase-app.js',

    // Local config/service imports that reference Firebase
    '../app/config\\.js$': '<rootDir>/tests/__mocks__/appConfig.js',
    '../sevices/firebaseClient\\.js$': '<rootDir>/tests/__mocks__/firebaseClient.js',
    '../services/firebaseClient\\.js$': '<rootDir>/tests/__mocks__/firebaseClient.js',

    // View module imports (operator.js imports these — mock them so file loads)
    './operatorIssue\\.js$': '<rootDir>/tests/__mocks__/emptyModule.js',
    './operatorFacility\\.js$': '<rootDir>/tests/__mocks__/emptyModule.js',
    './operatorQueue\\.js$': '<rootDir>/tests/__mocks__/emptyModule.js',
    './operatorProfile\\.js$': '<rootDir>/tests/__mocks__/emptyModule.js'
  },

  // Where to find test files
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ]
};
