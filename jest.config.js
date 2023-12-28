/** @type {import('jest').Config} */
export default {
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
    transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    moduleNameMapper: {
        '^(\\.\\/.+)\\.js$': '$1',
    },
    testEnvironment: 'jsdom',
};
