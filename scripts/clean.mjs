import { rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Removes every build artefact in the workspace.
 *
 * A Node script rather than `rm -rf`: this repo is developed on Linux and Windows,
 * and `rm` does not exist in cmd.exe or PowerShell, so the shell form fails for half
 * the team.
 */
const ARTEFACTS = ['shared/dist', 'backend/dist', 'frontend/.next'];

for (const artefact of ARTEFACTS) {
  rmSync(join(process.cwd(), artefact), { recursive: true, force: true });
  console.log(`removed ${artefact}`);
}
