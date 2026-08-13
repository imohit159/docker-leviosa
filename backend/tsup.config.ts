import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  dts: false,
  // The contracts package ships TypeScript-authored ESM from the workspace; bundling
  // it keeps `dist/` runnable without the workspace symlink being present.
  noExternal: ['@leviosa/shared'],
});
