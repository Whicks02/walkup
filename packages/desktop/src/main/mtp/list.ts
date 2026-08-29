import type { MtpDeviceInfo } from '@walkup/core';
import { runPowerShellJson } from './shell.js';

/**
 * List non-filesystem items under "This PC" (CSIDL_DRIVES / 0x11) — this is how MTP/WPD
 * portable devices (and other virtual namespace items) show up in Explorer. There's no
 * bulletproof way to distinguish "your Walkman" from some other portable device purely
 * through Shell.Application, so we surface every candidate and let the user pick by name.
 */
export async function listMtpDevices(): Promise<MtpDeviceInfo[]> {
  const script = `
$shell = New-Object -ComObject Shell.Application
$computer = $shell.NameSpace(0x11)
$results = @()
foreach ($item in $computer.Items()) {
  if (-not $item.IsFileSystem -and $item.IsFolder) {
    $results += @{ name = $item.Name }
  }
}
@{ ok = $true; devices = $results } | ConvertTo-Json -Compress -Depth 4
`;

  const result = await runPowerShellJson<{ devices: MtpDeviceInfo[] }>(script);
  if (!result.ok) {
    throw new Error(result.error ?? 'Failed to list MTP devices');
  }
  const devices = result.data?.devices;
  if (!devices) return [];
  return Array.isArray(devices) ? devices : [devices];
}
