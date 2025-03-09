import * as esbuild from 'esbuild';

const isProd = process.argv.includes('--prod');

await esbuild.build({
    entryPoints: ['src/__bench__/**', 'src/examples/**'],
    bundle: true,
    outdir: 'dist',
    minify: isProd,
    sourcemap: !isProd,
    target: 'es2020',
    format: 'esm',
    loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
    },
});
