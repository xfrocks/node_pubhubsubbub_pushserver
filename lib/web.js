'use strict';

const web = exports;
const config = require('./config');
const debug = require('debug')('pushserver:web');

let app = null;
web.app = function() {
    if (app === null) {
      const express = require('express');
      app = express();
      app.disable('x-powered-by');
      app.use(require('compression')({}));

      const bodyParser = require('body-parser');
      app.use(bodyParser.urlencoded({extended: true}));
      app.use(bodyParser.json());

      app.set('view engine', 'pug');
      app.use('/bs', express.static(__dirname +
        '/../node_modules/bootstrap/dist'));
    }

    return app;
  };

web.setup = function(app, db, pushQueue, adminSections) {
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

    return web;
  };

web.start = function(db, pushQueue) {
    const adminSections = {};

    if (!db) {
      debug('Loading db…');
      db = require('./db')(config);
      if (config.db.web) {
        adminSections.db = db.expressMiddleware();
      }
    }

    if (!pushQueue) {
      debug('Loading push queue…');

      pushQueue = require('./pushQueue');
      const kue = require('kue');
      const pushKue = pushQueue.createQueue(kue);
      if (config.pushQueue.web) {
          adminSections.queue = kue.app;
      }

      pushQueue.setup(pushKue, require('./pusher').setupDefault(), db);
    }

    debug('Starting…');
    const app = web.app();
    web.setup(app, db, pushQueue, adminSections);

    if (config.web.port > 0) {
      app.listen(config.web.port);
      debug('Listening on port', config.web.port, '…');
    }

    return app;
  };

web._reset = function() {
    app = null;
  };
