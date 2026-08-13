/**
 * Refuses an install driven by anything other than pnpm.
 *
 * This repo is a pnpm workspace. npm and yarn read `workspaces` from package.json,
 * pnpm reads pnpm-workspace.yaml, and installing with the wrong one produces a tree
 * that looks fine until the first script shells out to a binary that was never
 * linked — which surfaces as a MODULE_NOT_FOUND pointing at a *global* install path
 * and costs an afternoon to trace. Failing loudly here is cheaper.
 *
 * Written by hand rather than pulling `only-allow`: it is fifteen lines and a
 * preinstall guard should not need a network fetch to run.
 */
const agent = process.env.npm_config_user_agent ?? '';

// Unknown agents (CI images, Corepack shims, direct `node` invocations) are let
// through: a guard that blocks environments it cannot identify is worse than no guard.
if (agent && !agent.startsWith('pnpm/')) {
  const name = agent.split('/')[0];
  console.error(
    [
      '',
      `  This repo is a pnpm workspace, but the install was started by "${name}".`,
      '',
      '  Use pnpm instead:',
      '',
      '    corepack enable',
      '    pnpm install',
      '',
      '  Why: pnpm ignores the "workspaces" field in package.json and reads',
      '  pnpm-workspace.yaml. Installing with npm or yarn leaves the workspace',
      '  packages unlinked and every build script fails on a missing tsc.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
