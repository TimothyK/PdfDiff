const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const fs = require('fs');

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
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'src/**/*.html', to: '[name][ext]' },
        { from: 'src/**/*.css', to: '[name][ext]' },
        { from: 'images', to: 'images', noErrorOnMissing: true }
      ],
    }),
    new webpack.DefinePlugin({
      'PDF_WORKER_SRC': JSON.stringify(
        fs.readFileSync(
          path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
          'utf-8'
        )
      )
    })
  ],
};
