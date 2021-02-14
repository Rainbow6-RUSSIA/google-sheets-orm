const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  target: 'node',
  externals: [nodeExternals()],
  resolve: {
    extensions: ['.ts']
  },
  output: {
    filename: 'node.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'google-sheets-orm',
    libraryTarget: 'commonjs2'
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
