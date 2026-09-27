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
  ]),
  {
    rules: {
      // Imagens são URLs públicas do Storage (bucket `casasync-media`) e os
      // ícones do app em /public/icons: `<img>` é decisão de projeto, não
      // descuido (ADR-0005) — a regra só poluiria o lint de todos os cards.
      // Se um dia entrar um asset LCP-crítico, o caminho é `next/image` com
      // `images.remotePatterns` e aí a regra é reativada.
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
