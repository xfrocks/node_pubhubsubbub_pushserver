'use strict';

const db = exports;
const config = require('./config');
const debug = require('debug')('pushserver:db');
const _ = require('lodash');
const mongoose = require('mongoose');

// Use native promises
// http://mongoosejs.com/docs/promises.html
mongoose.Promise = global.Promise;

let mongoUri = config.db.mongoUri;
if (process.env.NODE_ENV && process.env.NODE_ENV === 'test') {
  mongoUri += '-test';
}

let isConnected = false;
mongoose.connect(config.db.mongoUri, function(err) {
    if (err) {
      debug('Error connecting to the MongoDb.', err);
    } else {
      isConnected = true;
      debug('Connected', mongoUri);
    }
  });

db.devices = require('./db/Device')(mongoose);
db.hubs = require('./db/Hub')(mongoose);
db.projects = require('./db/Project')(mongoose);

db.isConnected = function() {
  return isConnected;
};

db.stats = function() {
  return {
    db: {
      devices: db.devices.stats(),
      hubs: db.hubs.stats(),
      projects: db.projects.stats(),
    },
  };
};

db.expressMiddleware = function() {
    const mongoExpress = require('mongo-express/lib/middleware');
    const mongoUriParser = require('mongo-uri');

    const mec = require('mongo-express/config.default');
    mec.useBasicAuth = false;
    mec.options.readOnly = true;

    const mongoUriParsed = mongoUriParser.parse(mongoUri);
    _.assign(mec.mongodb, {
        server: _.first(mongoUriParsed.hosts),
        port: _.first(mongoUriParsed.ports),
        useSSL: false,
      });
    if (mec.mongodb.port === null) {
      mec.mongodb.port = 27017;
    }
    mec.mongodb.auth = [];
    if (mongoUriParsed.database) {
      const auth = {
          database: mongoUriParsed.database,
        };
      if (mongoUriParsed.username !== null &&
          mongoUriParsed.password !== null) {
        auth.username = mongoUriParsed.username;
        auth.password = mongoUriParsed.password;
      }
      mec.mongodb.auth.push(auth);
    }

    return mongoExpress(mec);
  };
