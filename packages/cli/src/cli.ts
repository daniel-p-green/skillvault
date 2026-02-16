#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

import { startServer } from '@skillvault/manager-api';
import {
  SkillVaultManager,
  type AdapterSpec,
  type InstallMode,
  type InstallScope,
  type TrustVerdict
} from '@skillvault/manager-core';
import { generateReceipt } from './lib/receipt.js';
import { scanBundle } from './lib/scan.js';
import { verifyBundle, verifyReceiptSignatureOnly } from './lib/verify.js';
import { failGateFromFindings, gateFromBundle, gateFromReceipt } from './lib/gate.js';
import { diffInputs } from './lib/diff.js';
import { exportBundleToZip } from './lib/export.js';

async function writeOutput(args: { out?: string | unknown }, content: string): Promise<void> {
  if (args.out) {
    await fs.writeFile(String(args.out), content, 'utf8');
    return;
  }
  process.stdout.write(content);
}

function requireManagerRoot(args: { root?: string | unknown }): string {
  return args.root ? String(args.root) : process.cwd();
}

async function withManager<T>(root: string, run: (manager: SkillVaultManager) => Promise<T>): Promise<T> {
  const manager = new SkillVaultManager(root);
  await manager.init();
  try {
    return await run(manager);
  } finally {
    await manager.close();
  }
}

export async function main(argv = process.argv): Promise<number> {
  // `process.exitCode` persists across multiple `main()` calls in the same process (tests).
  // Reset it so one command's exit code doesn't leak into the next.
  process.exitCode = 0;

  const normalizedArgv = [...argv];
  if (normalizedArgv[2] === 'manager' && normalizedArgv[3] === 'import') {
    normalizedArgv[3] = 'ingest';
  }

  const parser = yargs(hideBin(normalizedArgv))
    .scriptName('skillvault')
    .strict()
    .help()
    // Shared options (accepted by all commands).
    .option('policy', {
      type: 'string',
      describe: 'Path to policy.yaml'
    })
    .option('format', {
      choices: ['json', 'table'] as const,
      default: 'json',
      describe: 'Output format'
    })
    .option('out', {
      type: 'string',
      describe: 'Write output to this file (default: stdout)'
    })
    .option('deterministic', {
      type: 'boolean',
      default: false,
      describe: 'Freeze timestamps and enforce stable ordering for golden outputs'
    })
    .command(
      'scan <bundle_dir_or_zip>',
      'Scan a bundle and emit a deterministic scan report',
      (cmd) =>
        cmd.positional('bundle_dir_or_zip', {
          type: 'string',
          describe: 'Path to bundle directory or bundle.zip',
          demandOption: true
        }),
      async (args) => {
        const report = await scanBundle(String(args.bundle_dir_or_zip), { deterministic: Boolean(args.deterministic) });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`bundle_sha256: ${report.bundle_sha256}`);
          lines.push(`files: ${report.summary.file_count}`);
          lines.push(`total_bytes: ${report.summary.total_bytes}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }
      }
    )
    .command(
      'receipt <bundle>',
      'Generate an offline-verifiable signed receipt JSON for a bundle',
      (cmd) =>
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip',
            demandOption: true
          })
          .option('signing-key', {
            type: 'string',
            demandOption: true,
            describe: 'Path to Ed25519 private key PEM (PKCS#8)'
          })
          .option('key-id', {
            type: 'string',
            describe: 'Optional key identifier embedded in receipt.signature.key_id'
          }),
      async (args) => {
        const receipt = await generateReceipt(String(args.bundle), {
          policyPath: args.policy ? String(args.policy) : undefined,
          signingKeyPath: String(args.signingKey),
          keyId: args.keyId ? String(args.keyId) : undefined,
          deterministic: Boolean(args.deterministic)
        });

        const json = JSON.stringify(receipt, null, 2) + '\n';

        if (args.out) {
          await fs.writeFile(String(args.out), json, 'utf8');
        } else {
          process.stdout.write(json);
        }
      }
    )
    .command(
      'verify <bundle>',
      'Verify a bundle matches a receipt and passes policy/constraints (offline-verifiable via hashing)',
      (cmd) =>
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip',
            demandOption: true
          })
          .option('receipt', {
            type: 'string',
            demandOption: true,
            describe: 'Path to receipt.json'
          })
          .option('pubkey', {
            type: 'string',
            describe: 'Path to Ed25519 public key PEM for signature verification'
          })
          .option('keyring', {
            type: 'string',
            describe: 'Directory of Ed25519 public keys (lookup by key_id/filename convention)'
          })
          .option('offline', {
            type: 'boolean',
            default: false,
            describe: 'Forbid URL inputs / network fetches'
          }),
      async (args) => {
        const bundlePath = String(args.bundle);
        const receiptPath = String(args.receipt);

        const offline = Boolean(args.offline);
        if (offline) {
          const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s);
          if (looksLikeUrl(bundlePath) || looksLikeUrl(receiptPath) || (args.policy && looksLikeUrl(String(args.policy)))) {
            console.error('Offline mode forbids URL inputs');
            process.exitCode = 2;
            return;
          }
        }

        const pubkeyPath = args.pubkey ? String(args.pubkey) : undefined;
        const keyringDir = args.keyring ? String(args.keyring) : undefined;

        if ((pubkeyPath && keyringDir) || (!pubkeyPath && !keyringDir)) {
          console.error('verify requires exactly one of --pubkey <file> or --keyring <dir>');
          process.exitCode = 2;
          return;
        }

        const { report, exitCode } = await verifyBundle(bundlePath, {
          receiptPath,
          policyPath: args.policy ? String(args.policy) : undefined,
          pubkeyPath,
          keyringDir,
          offline,
          deterministic: Boolean(args.deterministic)
        });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`verified: ${report.verified ? 'YES' : 'NO'}`);
          lines.push(`bundle_sha256: ${report.bundle_sha256}`);
          lines.push(`receipt_bundle_sha256: ${report.receipt.bundle_sha256}`);
          lines.push(`verdict: ${report.policy.verdict}`);
          lines.push(`risk_score_total: ${report.policy.risk_score.total}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }

        process.exitCode = exitCode;
      }
    )
    .command(
      'gate [bundle]',
      'Apply a policy to either a previously generated receipt or a fresh bundle scan',
      (cmd) =>
        cmd
          .positional('bundle', {
            type: 'string',
            describe: 'Path to bundle directory or bundle.zip'
          })
          .option('receipt', {
            type: 'string',
            describe: 'Path to receipt.json (skip scanning and use receipt scan summary)'
          })
          .option('pubkey', {
            type: 'string',
            describe: 'Path to Ed25519 public key PEM for receipt trust verification (required with --receipt)'
          })
          .option('keyring', {
            type: 'string',
            describe: 'Directory of Ed25519 public keys (required with --receipt, lookup by key_id)'
          })
          .option('bundle', {
            type: 'string',
            describe: 'Optional bundle path used with --receipt for full hash verification before policy gating'
          }),
      async (args) => {
        if (!args.policy) {
          console.error('gate requires --policy policy.yaml');
          process.exitCode = 2;
          return;
        }

        const receiptPath = args.receipt ? String(args.receipt) : undefined;
        const bundlePath = args.bundle ? String(args.bundle) : undefined;

        if (!receiptPath && !bundlePath) {
          console.error('gate requires either --receipt receipt.json or a <bundle> argument');
          process.exitCode = 2;
          return;
        }

        if (receiptPath && bundlePath) {
          console.error('gate expects exactly one input: either --receipt or <bundle> (not both)');
          process.exitCode = 2;
          return;
        }

        const deterministic = Boolean(args.deterministic);

        let reportResult: { report: unknown; exitCode: number };
        if (receiptPath) {
          const pubkeyPath = args.pubkey ? String(args.pubkey) : undefined;
          const keyringDir = args.keyring ? String(args.keyring) : undefined;
          if ((pubkeyPath && keyringDir) || (!pubkeyPath && !keyringDir)) {
            console.error('gate --receipt requires exactly one of --pubkey <file> or --keyring <dir>');
            process.exitCode = 2;
            return;
          }

          const trust = await verifyReceiptSignatureOnly(receiptPath, { pubkeyPath, keyringDir });
          if (!trust.verified) {
            reportResult = failGateFromFindings(trust.findings, deterministic);
          } else if (args.bundle) {
            const verify = await verifyBundle(String(args.bundle), {
              receiptPath,
              policyPath: undefined,
              pubkeyPath,
              keyringDir,
              offline: false,
              deterministic
            });
            if (verify.exitCode !== 0 || !verify.report.verified) {
              reportResult = failGateFromFindings(verify.report.findings, deterministic);
            } else {
              reportResult = await gateFromReceipt(receiptPath, {
                policyPath: String(args.policy),
                deterministic
              });
            }
          } else {
            reportResult = await gateFromReceipt(receiptPath, {
              policyPath: String(args.policy),
              deterministic
            });
          }
        } else {
          reportResult = await gateFromBundle(String(bundlePath), {
            policyPath: String(args.policy),
            deterministic
          });
        }

        const { report, exitCode } = reportResult as { report: any; exitCode: number };

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`verdict: ${report.verdict}`);
          lines.push(`risk_score_total: ${report.risk_score.total}`);
          lines.push(`policy_verdict: ${report.policy.verdict}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }

        process.exitCode = exitCode;
      }
    )
    .command(
      'diff',
      'Compare two bundles and/or receipts and emit deterministic security-relevant deltas',
      (cmd) =>
        cmd
          .option('a', {
            type: 'string',
            demandOption: true,
            describe: 'Path to bundle directory / bundle.zip OR a receipt.json'
          })
          .option('b', {
            type: 'string',
            demandOption: true,
            describe: 'Path to bundle directory / bundle.zip OR a receipt.json'
          }),
      async (args) => {
        const report = await diffInputs(String(args.a), String(args.b), {
          policyPath: args.policy ? String(args.policy) : undefined,
          deterministic: Boolean(args.deterministic)
        });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`a_bundle_sha256: ${report.a.bundle_sha256 ?? ''}`);
          lines.push(`b_bundle_sha256: ${report.b.bundle_sha256 ?? ''}`);
          lines.push(`files: +${report.summary.added} -${report.summary.removed} ~${report.summary.modified} =${report.summary.unchanged}`);
          lines.push(`capabilities_added: ${report.capability_deltas.added.join(', ') || '-'}`);
          lines.push(`capabilities_removed: ${report.capability_deltas.removed.join(', ') || '-'}`);
          lines.push(`findings_added: ${report.finding_deltas.added.join(', ') || '-'}`);
          lines.push(`findings_removed: ${report.finding_deltas.removed.join(', ') || '-'}`);
          const out = lines.join('\n') + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), out, 'utf8');
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          if (args.out) {
            await fs.writeFile(String(args.out), json, 'utf8');
          } else {
            process.stdout.write(json);
          }
        }
      }
    )
    .command(
      'export <bundle_dir>',
      'Export a bundle directory to a strict_v0-compliant zip and validate it',
      (cmd) =>
        cmd
          .positional('bundle_dir', {
            type: 'string',
            describe: 'Path to bundle directory (not a zip)',
            demandOption: true
          })
          .option('out', {
            type: 'string',
            demandOption: true,
            describe: 'Path to write bundle.zip'
          })
          .option('profile', {
            type: 'string',
            default: 'strict_v0',
            describe: 'Export profile name (v0.1 supports strict_v0)'
          }),
      async (args) => {
        const report = await exportBundleToZip(String(args.bundle_dir), {
          outPath: String(args.out),
          policyPath: args.policy ? String(args.policy) : undefined,
          profile: String(args.profile),
          deterministic: Boolean(args.deterministic)
        });

        if (args.format === 'table') {
          const lines: string[] = [];
          lines.push(`validated: ${report.validated ? 'YES' : 'NO'}`);
          lines.push(`bundle_sha256: ${report.bundle_sha256}`);
          lines.push(`out_path: ${report.out_path}`);
          lines.push(`files: ${report.files.length}`);
          lines.push(`findings: ${report.findings.length}`);
          for (const f of report.findings) {
            lines.push(`- [${f.severity}] ${f.code}${f.path ? ` (${f.path})` : ''}: ${f.message}`);
          }
          const out = lines.join('\n') + '\n';
          if (args.out) {
            // NOTE: For export, --out is reserved for zip path; table/json always go to stdout.
            process.stdout.write(out);
          } else {
            process.stdout.write(out);
          }
        } else {
          const json = JSON.stringify(report, null, 2) + '\n';
          process.stdout.write(json);
        }

        process.exitCode = report.validated ? 0 : 1;
      }
    )
    .command(
      'manager',
      'SkillVault manager backend commands',
      (managerCmd) =>
        managerCmd
          .command(
            'init',
            'Initialize SkillVault manager storage in the selected root',
            (cmd) => cmd.option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
            async (args) => {
              const root = requireManagerRoot(args);
              const result = await withManager(root, async (manager) => manager.init());
              await writeOutput(args, JSON.stringify(result, null, 2) + '\n');
            }
          )
          .command(
            'adapters',
            'Manage adapter registry and adapter state',
            (adaptersCmd) =>
              adaptersCmd
                .command(
                  'list',
                  'List known adapters and enablement state',
                  (cmd) => cmd.option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const adapters = await withManager(root, async (manager) => manager.listAdapters());
                    if (args.format === 'table') {
                      const lines = [
                        'id | enabled | projectPath | globalPath',
                        ...adapters.map((adapter) => `${adapter.id} | ${adapter.isEnabled ? 'yes' : 'no'} | ${adapter.projectPath} | ${adapter.globalPath}`)
                      ];
                      await writeOutput(args, `${lines.join('\n')}\n`);
                      return;
                    }
                    await writeOutput(args, `${JSON.stringify({ adapters }, null, 2)}\n`);
                  }
                )
                .command(
                  'sync-snapshot',
                  'Sync built-in + override adapter snapshot into manager storage',
                  (cmd) => cmd.option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const result = await withManager(root, async (manager) => manager.syncAdapterSnapshot());
                    await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
                  }
                )
                .command(
                  'enable <id>',
                  'Enable an adapter target',
                  (cmd) =>
                    cmd
                      .positional('id', {
                        type: 'string',
                        demandOption: true,
                        describe: 'Adapter id'
                      })
                      .option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const result = await withManager(root, async (manager) => manager.setAdapterEnabled(String(args.id), true));
                    await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
                  }
                )
                .command(
                  'disable <id>',
                  'Disable an adapter target',
                  (cmd) =>
                    cmd
                      .positional('id', {
                        type: 'string',
                        demandOption: true,
                        describe: 'Adapter id'
                      })
                      .option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const result = await withManager(root, async (manager) => manager.setAdapterEnabled(String(args.id), false));
                    await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
                  }
                )
                .command(
                  'override',
                  'Add or replace a custom adapter override from JSON',
                  (cmd) =>
                    cmd
                      .option('file', {
                        type: 'string',
                        demandOption: true,
                        describe: 'Path to AdapterSpec JSON file'
                      })
                      .option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const filePath = String(args.file);
                    const raw = await fs.readFile(filePath, 'utf8');
                    const parsed = JSON.parse(raw) as Partial<AdapterSpec>;

                    const validateString = (name: string, value: unknown): string => {
                      if (typeof value !== 'string' || value.trim().length === 0) {
                        throw new Error(`Invalid adapter override: ${name} must be a non-empty string`);
                      }
                      return value;
                    };
                    const validateStringArray = (name: string, value: unknown): string[] => {
                      if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
                        throw new Error(`Invalid adapter override: ${name} must be a non-empty string[]`);
                      }
                      return value as string[];
                    };

                    const spec: AdapterSpec = {
                      id: validateString('id', parsed.id),
                      displayName: validateString('displayName', parsed.displayName),
                      projectPath: validateString('projectPath', parsed.projectPath),
                      globalPath: validateString('globalPath', parsed.globalPath),
                      detectionPaths: validateStringArray('detectionPaths', parsed.detectionPaths),
                      manifestFilenames: validateStringArray('manifestFilenames', parsed.manifestFilenames),
                      supportsSymlink: Boolean(parsed.supportsSymlink),
                      supportsGlobal: Boolean(parsed.supportsGlobal),
                      notes: typeof parsed.notes === 'string' ? parsed.notes : undefined
                    };

                    const root = requireManagerRoot(args);
                    const result = await withManager(root, async (manager) => manager.addAdapterOverride(spec));
                    await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
                  }
                )
                .command(
                  'validate',
                  'Validate adapter path configuration and manifest rules',
                  (cmd) => cmd.option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const issues = await withManager(root, async (manager) => manager.validateAdapterPaths());
                    if (args.format === 'table') {
                      if (issues.length === 0) {
                        await writeOutput(args, 'ok\n');
                      } else {
                        const lines = ['adapterId | issue', ...issues.map((issue) => `${issue.adapterId} | ${issue.issue}`)];
                        await writeOutput(args, `${lines.join('\n')}\n`);
                      }
                    } else {
                      await writeOutput(args, `${JSON.stringify({ issues }, null, 2)}\n`);
                    }
                    process.exitCode = issues.length === 0 ? 0 : 1;
                  }
                )
                .demandCommand(1, 'Provide an adapters subcommand'),
            async () => {}
          )
          .command(
            ['import <bundle_dir_or_zip>', 'ingest <bundle_dir_or_zip>'],
            'Import skill bundle into canonical vault, scan, and create manager receipt',
            (cmd) =>
              cmd
                .positional('bundle_dir_or_zip', {
                  type: 'string',
                  demandOption: true,
                  describe: 'Path to bundle directory or bundle.zip'
                })
                .option('source', {
                  type: 'string',
                  describe: 'Source locator (path/url/ref)'
                })
                .option('policy', {
                  type: 'string',
                  describe: 'Policy file reference recorded with import metadata'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const sourceLocator = args.source ? String(args.source) : String(args.bundle_dir_or_zip);
              const result = await withManager(root, async (manager) =>
                manager.importSkill(String(args.bundle_dir_or_zip), {
                  sourceType: args.source ? 'source' : 'path',
                  sourceLocator: args.policy ? `${sourceLocator}#policy=${String(args.policy)}` : sourceLocator
                })
              );
              await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
            }
          )
          .command(
            'inventory',
            'List current inventory from manager vault',
            (cmd) =>
              cmd
                .option('risk', {
                  choices: ['PASS', 'WARN', 'FAIL'] as const,
                  describe: 'Filter by trust verdict'
                })
                .option('adapter', {
                  type: 'string',
                  describe: 'Filter by adapter id'
                })
                .option('search', {
                  type: 'string',
                  describe: 'Search text'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const skills = await withManager(root, async (manager) =>
                manager.inventory({
                  risk: args.risk as TrustVerdict | undefined,
                  adapter: args.adapter ? String(args.adapter) : undefined,
                  search: args.search ? String(args.search) : undefined
                })
              );
              if (args.format === 'table') {
                const lines = [
                  'id | verdict | risk | version',
                  ...skills.map((skill) => `${skill.id} | ${skill.verdict ?? '-'} | ${skill.risk_total ?? 0} | ${skill.version_hash.slice(0, 12)}`)
                ];
                await writeOutput(args, `${lines.join('\n')}\n`);
                return;
              }
              await writeOutput(args, `${JSON.stringify({ skills }, null, 2)}\n`);
            }
          )
          .command(
            'deploy <skill_id>',
            'Deploy skill to adapter(s)',
            (cmd) =>
              cmd
                .positional('skill_id', {
                  type: 'string',
                  demandOption: true,
                  describe: 'Skill id in inventory'
                })
                .option('adapter', {
                  type: 'string',
                  demandOption: true,
                  describe: 'Adapter id or * for all enabled adapters'
                })
                .option('scope', {
                  choices: ['project', 'global'] as const,
                  default: 'project',
                  describe: 'Install scope'
                })
                .option('mode', {
                  choices: ['copy', 'symlink'] as const,
                  default: 'symlink',
                  describe: 'Install mode'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const deployments = await withManager(root, async (manager) =>
                manager.deploy(String(args.skill_id), {
                  adapter: String(args.adapter),
                  scope: args.scope as InstallScope,
                  mode: args.mode as InstallMode
                })
              );
              await writeOutput(args, `${JSON.stringify({ deployments }, null, 2)}\n`);
            }
          )
          .command(
            'undeploy <skill_id>',
            'Remove skill from adapter(s)',
            (cmd) =>
              cmd
                .positional('skill_id', {
                  type: 'string',
                  demandOption: true,
                  describe: 'Skill id in inventory'
                })
                .option('adapter', {
                  type: 'string',
                  demandOption: true,
                  describe: 'Adapter id or * for all enabled adapters'
                })
                .option('scope', {
                  choices: ['project', 'global'] as const,
                  default: 'project',
                  describe: 'Install scope to remove from'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const undeployed = await withManager(root, async (manager) =>
                manager.undeploy(String(args.skill_id), {
                  adapter: String(args.adapter),
                  scope: args.scope as InstallScope
                })
              );
              await writeOutput(args, `${JSON.stringify({ undeployed }, null, 2)}\n`);
            }
          )
          .command(
            'audit',
            'Summarize stale scans and deployment drift',
            (cmd) =>
              cmd
                .option('stale-days', {
                  type: 'number',
                  default: 14,
                  describe: 'Staleness threshold in days'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const summary = await withManager(root, async (manager) => manager.audit(Number(args.staleDays ?? 14)));
              if (args.format === 'table') {
                const lines = [
                  `skills: ${summary.totals.skills}`,
                  `deployments: ${summary.totals.deployments}`,
                  `stale_skills: ${summary.totals.staleSkills}`,
                  `drifted_deployments: ${summary.totals.driftedDeployments}`
                ];
                await writeOutput(args, `${lines.join('\n')}\n`);
                return;
              }
              await writeOutput(args, `${JSON.stringify(summary, null, 2)}\n`);
            }
          )
          .command(
            'telemetry',
            'Inspect and flush telemetry outbox events',
            (telemetryCmd) =>
              telemetryCmd
                .command(
                  'status',
                  'Show telemetry outbox status and recent events',
                  (cmd) =>
                    cmd
                      .option('limit', {
                        type: 'number',
                        default: 25,
                        describe: 'Number of recent events to return'
                      })
                      .option('root', {
                        type: 'string',
                        describe: 'Workspace root (defaults to cwd)'
                      }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const status = await withManager(root, async (manager) => manager.telemetryStatus(Number(args.limit ?? 25)));
                    if (args.format === 'table') {
                      const lines = [
                        `total: ${status.totals.total}`,
                        `pending: ${status.totals.pending}`,
                        `retry: ${status.totals.retry}`,
                        `sent: ${status.totals.sent}`,
                        `dead_letter: ${status.totals.dead_letter}`,
                        `skipped: ${status.totals.skipped}`
                      ];
                      await writeOutput(args, `${lines.join('\n')}\n`);
                      return;
                    }
                    await writeOutput(args, `${JSON.stringify(status, null, 2)}\n`);
                  }
                )
                .command(
                  'flush',
                  'Flush outbox events to jsonl or weave target',
                  (cmd) =>
                    cmd
                      .option('target', {
                        choices: ['jsonl', 'weave'] as const,
                        default: 'jsonl',
                        describe: 'Flush target transport'
                      })
                      .option('max-events', {
                        type: 'number',
                        default: 100,
                        describe: 'Maximum outbox events to flush'
                      })
                      .option('root', {
                        type: 'string',
                        describe: 'Workspace root (defaults to cwd)'
                      }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const report = await withManager(root, async (manager) =>
                      manager.flushTelemetry({
                        target: args.target as 'jsonl' | 'weave',
                        maxEvents: Number(args.maxEvents ?? 100)
                      })
                    );
                    await writeOutput(args, `${JSON.stringify(report, null, 2)}\n`);
                  }
                )
                .demandCommand(1, 'Provide a telemetry subcommand'),
            async () => {}
          )
          .command(
            'eval',
            'Seed datasets and run deterministic manager evaluations',
            (evalCmd) =>
              evalCmd
                .command(
                  'datasets',
                  'Manage eval datasets',
                  (datasetsCmd) =>
                    datasetsCmd
                      .command(
                        'seed',
                        'Seed default deterministic eval dataset',
                        (cmd) =>
                          cmd
                            .option('dataset', {
                              type: 'string',
                              describe: 'Dataset id (default: default-manager-regression)'
                            })
                            .option('root', {
                              type: 'string',
                              describe: 'Workspace root (defaults to cwd)'
                            }),
                        async (args) => {
                          const root = requireManagerRoot(args);
                          const result = await withManager(root, async (manager) => manager.seedEvalDataset(
                            args.dataset ? String(args.dataset) : undefined
                          ));
                          await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
                        }
                      )
                      .command(
                        'list',
                        'List eval datasets',
                        (cmd) => cmd.option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                        async (args) => {
                          const root = requireManagerRoot(args);
                          const datasets = await withManager(root, async (manager) => manager.listEvalDatasets());
                          await writeOutput(args, `${JSON.stringify({ datasets }, null, 2)}\n`);
                        }
                      )
                      .demandCommand(1, 'Provide a datasets subcommand'),
                  async () => {}
                )
                .command(
                  'run',
                  'Run an eval dataset and optionally compare against a baseline run',
                  (cmd) =>
                    cmd
                      .option('dataset', {
                        type: 'string',
                        demandOption: true,
                        describe: 'Dataset id'
                      })
                      .option('baseline', {
                        type: 'string',
                        describe: 'Baseline run id for regression comparison'
                      })
                      .option('fail-on-regression', {
                        type: 'boolean',
                        default: false,
                        describe: 'Return non-zero exit code when score regresses against baseline'
                      })
                      .option('root', {
                        type: 'string',
                        describe: 'Workspace root (defaults to cwd)'
                      }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const report = await withManager(root, async (manager) =>
                      manager.runEval({
                        datasetId: String(args.dataset),
                        baselineRunId: args.baseline ? String(args.baseline) : undefined,
                        failOnRegression: Boolean(args.failOnRegression)
                      })
                    );
                    await writeOutput(args, `${JSON.stringify(report, null, 2)}\n`);
                    if (report.regressionFailed) {
                      process.exitCode = 1;
                    }
                  }
                )
                .command(
                  'compare',
                  'Compare an eval run to its baseline',
                  (cmd) =>
                    cmd
                      .option('run', {
                        type: 'string',
                        demandOption: true,
                        describe: 'Eval run id'
                      })
                      .option('root', {
                        type: 'string',
                        describe: 'Workspace root (defaults to cwd)'
                      }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const comparison = await withManager(root, async (manager) => manager.compareEvalRun(String(args.run)));
                    await writeOutput(args, `${JSON.stringify(comparison, null, 2)}\n`);
                  }
                )
                .demandCommand(1, 'Provide an eval subcommand'),
            async () => {}
          )
          .command(
            'auth',
            'Manage local RBAC bootstrap and API tokens',
            (authCmd) =>
              authCmd
                .command(
                  'bootstrap',
                  'Create default roles and emit a local admin token',
                  (cmd) => cmd.option('root', { type: 'string', describe: 'Workspace root (defaults to cwd)' }),
                  async (args) => {
                    const root = requireManagerRoot(args);
                    const result = await withManager(root, async (manager) => manager.authBootstrap());
                    await writeOutput(args, `${JSON.stringify(result, null, 2)}\n`);
                  }
                )
                .command(
                  'token',
                  'Create role-scoped API token',
                  (tokenCmd) =>
                    tokenCmd
                      .command(
                        'create',
                        'Create an API token for a principal',
                        (cmd) =>
                          cmd
                            .option('principal', {
                              type: 'string',
                              demandOption: true,
                              describe: 'Principal id'
                            })
                            .option('role', {
                              choices: ['admin', 'operator', 'viewer'] as const,
                              demandOption: true,
                              describe: 'Role name'
                            })
                            .option('label', {
                              type: 'string',
                              describe: 'Optional token label'
                            })
                            .option('expires-at', {
                              type: 'string',
                              describe: 'Optional ISO timestamp when token expires'
                            })
                            .option('root', {
                              type: 'string',
                              describe: 'Workspace root (defaults to cwd)'
                            }),
                        async (args) => {
                          const root = requireManagerRoot(args);
                          const created = await withManager(root, async (manager) =>
                            manager.createAuthToken({
                              principalId: String(args.principal),
                              roleName: args.role as 'admin' | 'operator' | 'viewer',
                              label: args.label ? String(args.label) : undefined,
                              expiresAt: args.expiresAt ? String(args.expiresAt) : undefined
                            })
                          );
                          await writeOutput(args, `${JSON.stringify({
                            principalId: created.record.principalId,
                            roleName: created.record.roleName,
                            label: created.record.label,
                            token: created.token
                          }, null, 2)}\n`);
                        }
                      )
                      .demandCommand(1, 'Provide a token subcommand'),
                  async () => {}
                )
                .demandCommand(1, 'Provide an auth subcommand'),
            async () => {}
          )
          .command(
            'discover',
            'Search skills.sh via npx skills find',
            (cmd) =>
              cmd
                .option('query', {
                  type: 'string',
                  demandOption: true,
                  describe: 'Discovery query text'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const results = await withManager(root, async (manager) => manager.discover(String(args.query)));
              await writeOutput(args, `${JSON.stringify({ results }, null, 2)}\n`);
            }
          )
          .command(
            'serve',
            'Start local manager API server for GUI',
            (cmd) =>
              cmd
                .option('port', {
                  type: 'number',
                  default: 4646,
                  describe: 'HTTP port for manager API'
                })
                .option('root', {
                  type: 'string',
                  describe: 'Workspace root (defaults to cwd)'
                }),
            async (args) => {
              const root = requireManagerRoot(args);
              const port = Number(args.port ?? 4646);
              await startServer({
                port: Number.isFinite(port) ? port : 4646,
                rootDir: root
              });
              process.stdout.write(`SkillVault manager API listening on http://127.0.0.1:${Number.isFinite(port) ? port : 4646}\n`);
            }
          )
          .demandCommand(1, 'Provide a manager subcommand'),
      async () => {}
    )
    .demandCommand(1, 'Provide a command');

  await parser.parse();
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

// Only run if invoked as a binary, not imported by tests.
const isInvokedAsBin = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return process.argv[1] === thisFile;
  } catch {
    return false;
  }
})();

if (isInvokedAsBin) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
