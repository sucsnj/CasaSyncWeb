// Verificador de encoding — rode ANTES de commitar (ver AGENTS.md §1 e a seção
// "Gravação de arquivos: nunca usar PowerShell" do PROJECT_STATUS.md).
//
// Por que existe: um arquivo gravado pelo PowerShell com a codificação padrão do
// Windows fica VÁLIDO em UTF-8 — sem U+FFFD, sem erro de sintaxe. O compilador
// passa, o lint passa, o build passa. O estrago só aparece na tela (acentos
// virados em dois caracteres). Este script é a rede de segurança.
//
//   node scripts/check-encoding.mjs          # só reporta (exit 1 se achar)
//   node scripts/check-encoding.mjs --fix    # repara o que é inequívoco
//
// Não há dependência: só node:fs / node:path.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = process.cwd()
const FIX = process.argv.includes('--fix')
const SELF = 'scripts' + '\\' + 'check-encoding.mjs'
const EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.md', '.json', '.webmanifest',
])
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'out', 'dist', 'coverage', 'lessons',
])

// CP1252_HIGH serve SÓ para mapear caractere -> byte na hora de reverter
// mojibake. Não implica que o caractere seja lixo: "—", "–", "…" e as aspas
// curvas são usados de propósito neste projeto.
const CP1252_HIGH = {
  0x20ac: 0x80, 0x0081: 0x81, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89,
  0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x008d: 0x8d, 0x017d: 0x8e,
  0x008f: 0x8f, 0x0090: 0x90, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x009d: 0x9d,
  0x017e: 0x9e, 0x0178: 0x9f,
}
const HIGH_SPECIALS = new Set(Object.keys(CP1252_HIGH).map(Number))

// NUNCA aparece em português nem neste projeto — é resto de mojibake ou lixo
// colado de outra fonte. Deliberadamente MÍNIMO: um conjunto largo acusaria
// "—" e "…" (legítimos) e faria o script gritar à toa, que é como uma
// checagem ignorada apodrece. O resto é pega pelo mojibakeRunAt(), que é
// sensível ao contexto ("NÃO" passa, "Ã¡" não).
const NEVER_LEGIT = new Set([
  ...Array.from({ length: 32 }, (_, i) => 0x80 + i), // C1: byte cp1252 cru
  0x00ad, // soft hyphen (nunca usado)
  0x00d0, 0x00d1, // eth / thorn
  0x00ef, 0x00f0, 0x00f1, // i-cedilha, eth, n-cedilha
])

const isCjk = (cp) =>
  (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xff00 && cp <= 0xffef)

function byteOf(cp) {
  if (cp <= 0x7f) return cp
  if (cp >= 0xa0 && cp <= 0xff) return cp
  if (CP1252_HIGH[cp] !== undefined) return CP1252_HIGH[cp]
  // Faixa 0x80-0x9F crua: o PowerShell costuma guardar o BYTE, não o caractere
  // cp1252 (a seta "→" = E2 86 92 vira U+00E2 + U+0086 + U+0092).
  if (cp >= 0x80 && cp <= 0x9f) return cp
  return undefined
}

// Comprimento do trecho corrompido que começa em i (0 = não há).
// O "lead" de um mojibake é um caractere cujo BYTE UTF-8 foi lido como latin1:
// U+00C3 (a com til do latin1) ou U+00C2, U+00F0, U+00D1 — e "a" com
// til seguido de um byte 0x80-0x9F, que é o caso do travessão.
function mojibakeRunAt(text, i) {
  const first = text.codePointAt(i)
  const step = first > 0xffff ? 2 : 1
  const second = text.codePointAt(i + step)
  const trigger =
    first === 0x00c3 || // a-tilde (latin1) + byte de continuacao UTF-8
    first === 0x00c2 || // A-circunflexo (latin1)
    first === 0x00f0 || // eth (latin1)
    first === 0x00d1 || // thorn (latin1)
    (first === 0x00e2 && second !== undefined && HIGH_SPECIALS.has(second)) // a-circunflexo + 0x80-0x9F
  if (!trigger) return 0

  const bytes = []
  let j = i
  while (j < text.length && bytes.length < 12) {
    const cp = text.codePointAt(j)
    if (cp < 0x80) break
    const b = byteOf(cp)
    if (b === undefined) break
    bytes.push(b)
    j += cp > 0xffff ? 2 : 1
  }
  if (bytes.length < 2) return 0
  const decoded = Buffer.from(bytes).toString('utf8')
  const original = text.slice(i, j)
  // Tem que mudar E virar algo legível — senão é texto bom ("NÃO", "às").
  if (decoded === original) return 0
  if (decoded.includes('\uFFFD')) return 0
  if (/[\u0080-\u009f]/.test(decoded)) return 0
  return j - i
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue
    }
    if (stats.isDirectory()) walk(full, out)
    else if (EXTS.has(extname(entry))) out.push(full)
  }
  return out
}

// Mostra o trecho com os caracteres suspeitos em \u{...}, para o log não virar
// mais um lugar com mojibake.
function render(text) {
  return [...text]
    .map((ch) => {
      const cp = ch.codePointAt(0)
      if (cp === 0xfffd || cp === 0xfeff) return `<U+${cp.toString(16).toUpperCase()}>`
      if (NEVER_LEGIT.has(cp) || (cp >= 0x80 && cp <= 0x9f)) {
        return `<U+${cp.toString(16).toUpperCase()}>`
      }
      if (isCjk(cp)) return `<U+${cp.toString(16).toUpperCase()}>`
      return ch
    })
    .join('')
}

const findings = []
let repaired = 0

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  // Este arquivo contém de propósito os bytes/caracteres que ele procura.
  if (rel === SELF || rel === SELF.replace(/\\/g, '/')) continue
  const original = readFileSync(file, 'utf8')
  let text = original

  // BOM solto (U+FEFF) em qualquer posição.
  const boms = text.match(/\uFEFF/g)
  if (boms) {
    findings.push(`${rel}: ${boms.length} BOM (U+FEFF) — rode com --fix`)
    if (FIX) text = text.replace(/\uFEFF/g, '')
  }

  // Mojibake: reverte byte a byte (UTF-8 lido como latin1/cp1252).
  let out = ''
  for (let i = 0; i < text.length; ) {
    const len = mojibakeRunAt(text, i)
    if (len > 0) {
      const bytes = [...text.slice(i, i + len)].map((c) => byteOf(c.codePointAt(0)))
      const fixed = Buffer.from(bytes).toString('utf8')
      if (FIX) {
        out += fixed
        repaired++
        i += len
        continue
      }
      findings.push(`${rel}: mojibake "${render(text.slice(i, i + len))}" -> "${fixed}"`)
      out += text.slice(i, i + len)
      i += len
      continue
    }
    out += text[i]
    i++
  }
  text = out

  // Caracteres de controle, bytes cp1252 crus e CJK: denuncia, não corrige.
  const lines = text.split('\n')
  lines.forEach((line, idx) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0)
      if (cp === 0xfffd) {
        findings.push(`${rel}:${idx + 1} U+FFFD (caractere de substituição)`)
        break
      }
      if (NEVER_LEGIT.has(cp)) {
        findings.push(
          `${rel}:${idx + 1} <U+${cp.toString(16).toUpperCase()}> (byte cp1252 cru)`
        )
        break
      }
      if (isCjk(cp)) {
        findings.push(`${rel}:${idx + 1} <U+${cp.toString(16).toUpperCase()}> (CJK fora do lugar)`)
        break
      }
    }
  })

  if (FIX && text !== original) {
    writeFileSync(file, text, 'utf8')
  }
}

if (findings.length) {
  const unique = [...new Set(findings)]
  console.error('ENCODING — problemas encontrados:\n')
  unique.forEach((f) => console.error('  ' + f))
  console.error(
    `\n${unique.length} problema(s).` +
      (FIX ? '\nRode de novo para confirmar o que sobrou.' : '\nUse --fix para reparar o que for inequívoco.')
  )
  process.exit(1)
}

console.log(
  FIX
    ? `ENCODING OK — ${repaired} trecho(s) reparado(s), nada sobrando.`
    : 'ENCODING OK — nenhum mojibake, BOM ou caractere estranho.'
)