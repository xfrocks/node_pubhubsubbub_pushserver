'use strict';

const web = exports;
const config = require('./config');
const debug = require('debug')('pushserver:web');
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');

const app = express();
app.use(compression({}));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.disable('x-powered-by');

app.set('view engine', 'pug');
app.use('/bs', express.static(__dirname + '/../node_modules/bootstrap/dist'));

web._app = app;
web.start = function(port, db, pushQueue, adminSections) {
    const pubhubsubbub = require('./web/pubhubsubbub')
      .setup(app, '', db, pushQueue);

    if (config.web.adminPrefix &&
        config.web.username &&
        config.web.password) {
      require('./web/admin').setup(
        app,
        config.web.adminPrefix,
        config.web.username,
        config.web.password,
        pubhubsubbub,
        db,
        pushQueue,
        adminSections
      );
    }

    app.listen(port);
    debug('Listening on port', port, '…');

    return web;
  };
