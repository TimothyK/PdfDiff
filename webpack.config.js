const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/extension.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'extension.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/**/*.html', to: '[name][ext]' },
        { from: 'src/**/*.css', to: '[name][ext]' },
        { from: 'images', to: 'images', noErrorOnMissing: true },
        { from: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs', to: 'pdf.worker.min.mjs' }
      ],
    }),
  ],
};
