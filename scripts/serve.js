/* eslint-disable no-console */
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const express = require('express');
const https = require('https');
const webpack = require('webpack');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const openBrowser = require('react-dev-utils/openBrowser');
const clearConsole = require('react-dev-utils/clearConsole');
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');

const config = require('../config');
const paths = require('../config/paths');
const webpackConfig = require('../config/webpack.dev.conf');
const shopify = require('../lib/shopify-deploy');

const fakeCert = fs.readFileSync(path.join(__dirname, '../ssl/server.pem'));
const sslOptions = {
  key: fakeCert,
  cert: fakeCert,
};

const app = express();
const server = https.createServer(sslOptions, app);
const compiler = webpack(webpackConfig);

const shopifyUrl = `https://${config.shopify.development.store}`;
const previewUrl = `${shopifyUrl}?preview_theme_id=${config.shopify.development.theme_id}`;

function getFilesFromAssets(assets) {
  let files = [];

  Object.keys(assets).forEach((key) => {
    const asset = assets[key];

    if (asset.emitted) {
      // webpack-dev-server doesn't write assets to disk, see webpack.base.conf.js
      // where we use WriteFileWebpackPlugin to write certain assets to disk
      // (the ones to be uploaded) (the others are served from memory)
      if (fs.existsSync(asset.existsAt)) {
        files = [...files, asset.existsAt.replace(paths.dist, '')];
      }
    }
  });

  return files;
}

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', shopifyUrl);
  next();
});

app.use(webpackDevMiddleware(compiler, {
  quiet: true,
  reload: false,
}));

const hotMiddleware = webpackHotMiddleware(compiler);
app.use(hotMiddleware);

compiler.plugin('invalid', () => {
  clearConsole();
  console.log('Compiling...');
});

compiler.plugin('done', (stats) => {
  clearConsole();

  // webpack messages massaging and logging gracioulsy provided by create-react-app.
  const messages = formatWebpackMessages(stats.toJson({}, true));

  // If errors exist, only show errors.
  if (messages.errors.length) {
    console.log(chalk.red('Failed to compile.'));
    console.log();
    messages.errors.forEach((message) => {
      console.log(message);
      console.log();
    });
    return;
  }

  // Show warnings if no errors were found.
  if (messages.warnings.length) {
    console.log(chalk.yellow('Compiled with warnings.'));
    console.log();
    messages.warnings.forEach((message) => {
      console.log(message);
      console.log();
    });
    // Teach some ESLint tricks.
    console.log('You may use special comments to disable some warnings.');
    console.log(`Use ${chalk.yellow('// eslint-disable-next-line')} to ignore the next line.`);
    console.log(`Use ${chalk.yellow('/* eslint-disable */')} to ignore all warnings in a file.`);
  }

  if (!messages.errors.length && !messages.warnings.length) {
    console.log(chalk.green('Compiled successfully!'));
    console.log();
    console.log('The app is running at:');
    console.log();
    console.log(`  ${chalk.cyan(previewUrl)}`);
    console.log();
  }

  const files = getFilesFromAssets(stats.compilation.assets);

  console.log(chalk.cyan('Uploading files to Shopify...'));
  console.log();
  files.forEach((file) => {
    console.log(`  ${file}`);
  });
  console.log();

  shopify.sync({ upload: files }).then(() => {
    // Do not warn about updating theme.liquid, it's also updated when styles
    // and scripts are updated.
    if (files.length === 1 && files[0] === '/layout/theme.liquid') {
      return;
    }

    hotMiddleware.publish({ action: 'shopify_upload_finished' });

    console.log();
    console.log(chalk.green('Files uploaded successfully!'));
    console.log();
  }).catch((err) => {
    console.log(chalk.red(err));
  });
});

server.listen(config.port, (err) => {
  if (err) {
    console.log(chalk.red(err));
    return;
  }

  openBrowser(previewUrl);
});
