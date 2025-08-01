import { defineBuildConfig } from 'unbuild'

// https://github.com/unjs/unbuild
export default defineBuildConfig({
  declaration: true,
  rollup: {
    emitCJS: false,
    esbuild: {
      minify: false,
    },
  },

  entries: [
    './src/index.ts',
  ],
})
