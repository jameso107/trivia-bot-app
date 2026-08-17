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
    // Supabase CLI scratch space (generated, minified)
    "supabase/.temp/**",
    // Deno-runtime files (npm: specifiers, Deno globals) — checked by the
    // Supabase CLI's Deno toolchain, not Node ESLint
    "supabase/functions/**/index.ts",
    "supabase/functions/_shared/deno.ts",
  ]),
]);

export default eslintConfig;
