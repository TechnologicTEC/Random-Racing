/**
 * Test helper: checks one source file from a pure layer (src/core or src/gen)
 * against the brief's architecture rules. Used by src/architecture.test.ts.
 */

const FORBIDDEN_CODE: Array<[RegExp, string]> = [
  [/\bMath\.random\b/, 'uses Math.random (use the seeded generator)'],
  [/\bDate\.now\b|\bnew\s+Date\b/, 'reads the clock (Date)'],
  [/\bperformance\b/, 'reads the clock (performance)'],
];

/**
 * Math members that give the same answer in every browser. Anything else
 * (sin, cos, hypot, pow...) is implementation-defined and banned from pure code.
 */
const EXACT_MATH = new Set([
  'sqrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'min', 'max', 'sign', 'imul', 'fround', 'clz32',
  'PI', 'SQRT2', 'SQRT1_2', 'E',
  'random', // reported by its own rule above
]);

const FORBIDDEN_PACKAGES =[/^three(\/|$)/, /^@dimforge\//];

/** Which top-level folders each pure layer may import from. */
const ALLOWED_LAYERS: Record<string, string[]> = {
  core: ['core'],
  gen: ['core', 'gen'],
};

interface ImportStatement {
  specifier: string;
  typeOnly: boolean;
}

/**
 * @param path file path relative to src, such as "./gen/track/layout.ts"
 * @returns one message per broken rule; empty when the file is clean
 */
export function findViolations(path: string, source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];

  for (const [pattern, message] of FORBIDDEN_CODE) {
    if (pattern.test(code)) violations.push(message);
  }

  const inexact = new Set<string>();
  for (const match of code.matchAll(/\bMath\.(\w+)/g)) {
    if (!EXACT_MATH.has(match[1]!)) inexact.add(match[1]!);
  }
  for (const name of inexact) {
    violations.push(`uses Math.${name}, which can differ between browsers (see core/dmath.ts)`);
  }

  const segments = path.replace(/^\.\//, '').split('/');
  const layer = segments[0] ?? '';
  const allowed = ALLOWED_LAYERS[layer] ?? [];

  for (const { specifier, typeOnly } of findImports(code)) {
    if (!specifier.startsWith('.')) {
      if (FORBIDDEN_PACKAGES.some((pattern) => pattern.test(specifier))) {
        violations.push(`imports the package "${specifier}"`);
      }
      continue;
    }
    const target = resolve(segments.slice(0, -1), specifier)[0] ?? '';
    if (allowed.includes(target)) continue;
    // Generation may know the shape of the config, but values must be passed in.
    if (layer === 'gen' && target === 'config' && typeOnly) continue;
    violations.push(`imports "${specifier}" from outside its layer (${target})`);
  }

  return violations;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function findImports(code: string): ImportStatement[] {
  const found: ImportStatement[] = [];
  const fromPattern = /\b(?:import|export)\s+(type\s+)?[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const barePattern = /\bimport\s*\(?\s*['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(fromPattern)) {
    found.push({ specifier: match[2]!, typeOnly: match[1] !== undefined });
  }
  for (const match of code.matchAll(barePattern)) {
    found.push({ specifier: match[1]!, typeOnly: false });
  }
  return found;
}

/** Resolves a relative import against a folder, both as path segments under src. */
function resolve(folder: string[], specifier: string): string[] {
  const out = [...folder];
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out;
}
