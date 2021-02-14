const path = require('path');

module.exports = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  resolve: {
    extensions: ['.ts'],
  },
  output: {
    filename: 'browser.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: 'GoogleSheetsORM',
    libraryExport: 'default',
  },
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /(node_modules|bower_components)/,
        use: 'ts-loader'
      }
    ]
  }
};
