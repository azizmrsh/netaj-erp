import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Historical snapshots are not executable source and are intentionally
    // excluded so lint reports only the code that ships.
    "backups/**",
    "netaj-backups/**",
    "**/*.backup.*",
    "**/*.before-*.ts",
  ]),
]);

export default eslintConfig;
