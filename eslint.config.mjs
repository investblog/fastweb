import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['src/**/*.ts'],
  ignores: ['node_modules', 'dist', '.output', '.wxt'],
  extends: [...tseslint.configs.recommendedTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    // Disable everything except floating promises
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-base-to-string': 'off',
    '@typescript-eslint/no-misused-promises': 'off',
    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/require-await': 'off',
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/only-throw-error': 'off',
    '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    '@typescript-eslint/prefer-promise-reject-errors': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',

    // The one rule we care about
    '@typescript-eslint/no-floating-promises': 'error',
  },
});
