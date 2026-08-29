import { execFile } from 'node:child_process';

/**
 * Escape a value for embedding inside a single-quoted PowerShell string literal.
 * We build PowerShell scripts by string interpolation (not by passing separate
 * process args), so every piece of dynamic data — device names, folder segments,
 * file paths — MUST go through this before being placed inside `'...'`.
 */
export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Build a PowerShell array-of-strings literal, e.g. @('a','b','c'). */
export function psStringArray(values: string[]): string {
  return `@(${values.map(psQuote).join(',')})`;
}

export interface RunPowerShellResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Run a PowerShell script and parse its final line as JSON. The script is expected to
 * either write a JSON result (via ConvertTo-Json) on success, or throw — any thrown
 * error is caught here and reported back as { ok: false, error }.
 *
 * The script is passed via -EncodedCommand (base64 UTF-16LE) so we never have to worry
 * about PowerShell's own command-line quoting/escaping on top of our own.
 */
export function runPowerShellJson<T>(script: string): Promise<RunPowerShellResult<T>> {
  const wrapped = `
$ErrorActionPreference = 'Stop'
try {
${script}
} catch {
  $err = @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  Write-Output $err
  exit 1
}
`.trim();

  const encoded = Buffer.from(wrapped, 'utf16le').toString('base64');

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: 5 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const lastLine = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .pop();

        if (!lastLine) {
          resolve({ ok: false, error: error?.message ?? (stderr || 'No output from PowerShell script') });
          return;
        }

        try {
          const parsed = JSON.parse(lastLine) as { ok?: boolean; error?: string } & Record<string, unknown>;
          if (parsed.ok === false) {
            resolve({ ok: false, error: parsed.error ?? 'Unknown PowerShell error' });
          } else {
            resolve({ ok: true, data: parsed as T });
          }
        } catch {
          resolve({ ok: false, error: `Could not parse PowerShell output: ${lastLine}` });
        }
      },
    );
  });
}
