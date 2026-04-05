const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: !isWatch,
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
  },
};

if (isWatch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('[esbuild] watching...');
  });
} else {
  esbuild.build(buildOptions).then(result => {
    if (result.errors.length > 0) {
      console.error('[esbuild] build failed');
      process.exit(1);
    }
    console.log('[esbuild] build succeeded → dist/extension.js');
  }).catch(() => process.exit(1));
}
