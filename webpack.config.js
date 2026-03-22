const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const fs = require('fs');
const vssExtension = JSON.parse(fs.readFileSync(path.join(__dirname, 'vss-extension.json'), 'utf-8'));

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
      'EXTENSION_VERSION': JSON.stringify(vssExtension.version),
      'PDF_WORKER_SRC': JSON.stringify(
        fs.readFileSync(
          path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
          'utf-8'
        )
      )
    })
  ],
};
