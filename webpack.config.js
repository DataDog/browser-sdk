const path = require('path');

module.exports = {
    entry: './src/index.js',
    mode: 'production',
    output: {
        filename: 'browser-agent.js',
        path: path.resolve(__dirname, 'dist')
   }
};
