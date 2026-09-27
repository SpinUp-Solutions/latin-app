// Runs application sources through babel-plugin-react-compiler before Next's SWC Jest transform, so
// component tests exercise the same auto-memoized code that `next build` ships (reactCompiler: true).
/* eslint-disable @typescript-eslint/no-require-imports -- Jest loads transformers as CommonJS. */
const babel = require('@babel/core');
const { createTransformer: createSwcTransformer } = require('next/dist/build/swc/jest-transformer');

const APP_SOURCE = /[\\/](src|shared)[\\/].+\.[jt]sx?$/;

module.exports = {
  createTransformer(options) {
    const swc = createSwcTransformer(options);
    return {
      process(source, filename, jestOptions) {
        if (APP_SOURCE.test(filename) && !/[\\/]node_modules[\\/]/.test(filename)) {
          source = babel.transformSync(source, {
            filename,
            babelrc: false,
            configFile: false,
            // SWC composes an inline input map with its own, keeping stack traces on source lines.
            sourceMaps: 'inline',
            parserOpts: { plugins: ['typescript', 'jsx'] },
            plugins: [['babel-plugin-react-compiler', { panicThreshold: 'none' }]],
          }).code;
        }
        return swc.process(source, filename, jestOptions);
      },
    };
  },
};
