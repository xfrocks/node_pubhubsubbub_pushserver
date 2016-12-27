'use strict';

const debug = require('debug')('pushserver:db');
const _ = require('lodash');
const mongoose = require('mongoose');

// Use native promises
// http://mongoosejs.com/docs/promises.html
mongoose.Promise = global.Promise;

exports = module.exports = function(config) {
    let isConnecting = true;
    let isConnected = false;

    let mongoUri = config.db.mongoUri;
    if (_.has(process.env, 'NODE_ENV')) {
      mongoUri += process.env.NODE_ENV;
    }

    const connection = mongoose.createConnection(mongoUri, function(err) {
        if (err) {
          debug('Error connecting', mongoUri, err);
        } else {
          db.devices = require('./db/Device')(connection);
          db.hubs = require('./db/Hub')(connection);
          db.projects = require('./db/Project')(connection);

          isConnected = true;
          debug('Connected', mongoUri);
        }

        isConnecting = false;
      });

    const db = {
      expressMiddleware: function() {
        return setupMongoExpress(mongoUri);
      },

      isConnecting: function() {
        return isConnecting;
      },

      isConnected: function() {
        return isConnected;
      },

      closeConnection: function() {
        return connection.close();
      },

      stats: function() {
        return Promise.all([
          db.devices.stats(),
          db.hubs.stats(),
          db.projects.stats(),
        ]).then(function(collections) {
          const db = {};

          _.forEach(collections, (collection) => {
            _.merge(db, collection);
          });

          return {db};
        });
      },
    };

    return db;
  };

const setupMongoExpress = function(mongoUri) {
    const mongoExpress = require('mongo-express/lib/middleware');
    const mongoUriParser = require('mongo-uri');

    const mec = require('mongo-express/config.default');
    mec.useBasicAuth = false;
    mec.options.readOnly = true;
    mec.options.logger = {skip: () => true};

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
