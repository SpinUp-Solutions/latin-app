// Runs application sources through babel-plugin-react-compiler before Next's SWC Jest transform, so
// component tests exercise the same auto-memoized code that `next build` ships (reactCompiler: true).
/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads transformers as CommonJS. */
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const babel = require('@babel/core');
const { createTransformer: createSwcTransformer } = require('next/dist/build/swc/jest-transformer');

const APP_SOURCE = /[\\/](src|shared)[\\/].+\.[jt]sx?$/;
// Neither transformer defines a cache key, so include their versions and this file, or changes would reuse stale output.
const TOOL_VERSIONS = ['@babel/core', 'babel-plugin-react-compiler', 'next']
  .map(name => `${name}@${require(`${name}/package.json`).version}`)
  .join(',');
const TRANSFORMER_SOURCE = readFileSync(__filename);

// Plain .ts files are not TSX: parsing them with JSX enabled rejects `<Type>value` assertions that SWC accepts.
function parserPlugins(filename) {
  if (/\.ts$/.test(filename)) return ['typescript'];
  return /\.tsx$/.test(filename) ? ['typescript', 'jsx'] : ['jsx'];
}

module.exports = {
  createTransformer(options) {
    const swc = createSwcTransformer(options);
    return {
      getCacheKey(source, filename, jestOptions) {
        return createHash('sha1')
          .update(source)
          .update('\0')
          .update(filename)
          .update('\0')
          .update(jestOptions.configString)
          .update('\0')
          .update(jestOptions.instrument ? 'instrument' : '')
          .update('\0')
          .update(TOOL_VERSIONS)
          .update(TRANSFORMER_SOURCE)
          .digest('hex');
      },
      process(source, filename, jestOptions) {
        if (APP_SOURCE.test(filename) && !/[\\/]node_modules[\\/]/.test(filename)) {
          source = babel.transformSync(source, {
            filename,
            babelrc: false,
            configFile: false,
            // SWC composes an inline input map with its own, keeping stack traces on source lines.
            sourceMaps: 'inline',
            parserOpts: { plugins: parserPlugins(filename) },
            plugins: [['babel-plugin-react-compiler', { panicThreshold: 'none' }]],
          }).code;
        }
        return swc.process(source, filename, jestOptions);
      },
    };
  },
};
