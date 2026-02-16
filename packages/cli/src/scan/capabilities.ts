import type { Capability } from '../contracts.js';
import type { BundleFile } from '../lib/bundle.js';
import { normalizeTextForAnalysis } from '../text/normalize.js';

interface CapabilityRule {
  capability: Capability;
  path?: RegExp;
  content?: RegExp;
}

const RULES: CapabilityRule[] = [
  {
    capability: 'network',
    path: /(^|\/)(curl|wget|http|net|network|socket)(\/|\.|-|_)/i,
    content:
      /\b(fetch\s*\(|axios\.|https?:\/\/|websocket|socket\.|net\.|curl\b|wget\b|requests\.|httpx\.|urllib\.|aiohttp\.)/i
  },
  {
    capability: 'exec',
    path: /\.(sh|bash|zsh|command)$/i,
    content:
      /\b(child_process|execSync?\s*\(|spawn\s*\(|fork\s*\(|subprocess\.|os\.system\s*\(|runtime\.exec\s*\(|shell:\s*true)\b/i
  },
  {
    capability: 'writes',
    path: /(^|\/)(tmp|dist|build|output|cache|logs?)(\/|$)/i,
    content:
      /\b(writeFile\s*\(|appendFile\s*\(|createWriteStream\s*\(|fs\.writeFile|fs\.promises\.writeFile|mkdir\s*\(|mkdtemp\s*\(|rm\s*\(|unlink\s*\()/i
  },
  {
    capability: 'reads',
    path: /(^|\/)(docs?|input|fixtures?|templates?)(\/|$)/i,
    content:
      /\b(readFile\s*\(|createReadStream\s*\(|fs\.readFile|fs\.promises\.readFile|readdir\s*\(|glob\s*\(|cat\s+|open\s*\([^)]*['"]r['"])\b/i
  },
  {
    capability: 'secrets',
    path: /(^|\/)(\.env|secrets?|credentials?|keys?)(\/|\.|-|_|$)/i,
    content:
      /\b(api[_-]?key|access[_-]?token|secret|password|private[_-]?key|client[_-]?secret|aws_secret_access_key|op:\/\/|bearer\s+)/i
  },
  {
    capability: 'dynamic_code',
    content: /(eval\s*\(|new\s+Function\s*\(|Function\s*\(|vm\.runIn|import\s*\([^)]*\+|require\s*\([^)]*\+|exec\s*\()/i
  }
];

function comparePathBytewise(a: string, b: string): number {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return Buffer.compare(left, right);
}

export function inferCapabilities(files: BundleFile[]): Capability[] {
  const sortedFiles = [...files].sort((a, b) => comparePathBytewise(a.path, b.path));
  const found = new Set<Capability>();

  for (const file of sortedFiles) {
    const normalizedText = normalizeTextForAnalysis(Buffer.from(file.bytes).toString('utf8'));

    for (const rule of RULES) {
      if (rule.path?.test(file.path) || rule.content?.test(normalizedText)) {
        found.add(rule.capability);
      }
    }
  }

  return [...found].sort();
}
