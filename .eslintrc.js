module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  settings: {
    node: {
      tryExtensions: [".js", ".json", ".node", ".ts", ".d.ts"],
    },
  },
  plugins: ["@typescript-eslint", "no-only-tests"],
  extends: [
    "standard",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    "node/no-unsupported-features/es-syntax": [
      "error",
      { ignores: ["modules"] },
    ],
    "no-only-tests/no-only-tests": "error",
    "no-unused-expressions": "warn",
    camelcase: ["error", { ignoreImports: true }],
    "no-unused-vars": "warn",
    "no-useless-constructor": "off",
  },
};
