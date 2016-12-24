'use strict';

var pusher = exports;
var debug = require('debug')('pushserver:pusher:apn');
var _ = require('lodash');

var config;
var lib;
var connections = {};
var connectionCount = 0;
pusher.setup = function(_config, _lib) {
  config = _config;
  lib = _lib;

  return pusher;
};

pusher._resetConnections = function() {
    connections = {};
    connectionCount = 0;
  };

pusher._cleanUpConnections = function(ttlInMs) {
    var cutoff = _.now() - ttlInMs;

    _.pickBy(connections, function(c) {
        if (c.lastUsed < cutoff) {
          c.provider.shutdown();
          return false;
        }

        // keep this connection
        return true;
      });
  };

pusher.send = function(connectionOptions, token, payload, callback) {
    if (!lib) {
      return callback('lib missing');
    }

    if (!_.has(payload, 'aps.alert')) {
      return callback('payload.aps.alert missing');
    }

    var connection = createConnection(connectionOptions);
    if (connection === null) {
      return callback('Unable to create connection');
    }
    debug(connection.id, 'time since lastUsed', _.now() - connection.lastUsed);

    var filteredPayload = _.omit(payload, ['aps', 'expiry']);
    var notification = new lib.Notification(filteredPayload);

    notification.topic = connectionOptions.packageId;
    notification.alert = payload.aps.alert;

    if (_.has(payload, 'aps.badge')) {
      notification.badge = payload.aps.badge;
    } else if (_.has(config, 'apn.notificationOptions.badge')) {
      notification.badge = config.apn.notificationOptions.badge;
    }

    if (_.has(payload, 'aps.sound')) {
      notification.sound = payload.aps.sound;
    } else if (_.has(config, 'apn.notificationOptions.sound')) {
      notification.sound = config.apn.notificationOptions.sound;
    } else {
      notification.sound = 'default';
    }

    if (_.has(payload, 'expiry')) {
      notification.expiry = payload.expiry;
    } else if (_.has(config, 'apn.notificationOptions.expiry')) {
      notification.expiry = config.apn.notificationOptions.expiry;
    } else {
      // attempt to push once unless specified otherwise
      notification.expiry = 0;
    }

    return connection.provider.send(notification, [token])
    .then(function(result) {
        if (result.sent.length > 0) {
          connection.sentCount += result.sent.length;
          debug('connectionId', connection.id,
            'sentCount', connection.sentCount);
        }

        if (result.failed.length > 0) {
          connection.failedCount += result.failed.length;
          debug('connectionId', connection.id,
            'failedCount', connection.failedCount);
        }

        if (_.isFunction(callback)) {
          var err = null;
          if (result.failed.length > 0) {
            _.forEach(result.failed, function(failed) {
              if (_.has(failed, 'error')) {
                err = failed.error;
              } else if (_.has(failed, 'response.reason')) {
                err = failed.response.reason;
              } else {
                err = 'Unknown error';
              }

              if (_.has(failed, 'status')) {
                var status = parseInt(failed.status);
                if (status >= 400 && status < 500) {
                  // https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html#//apple_ref/doc/uid/TP40008194-CH11-SW2
                  result.retry = false;
                  switch (status) {
                    case 429:
                      // TODO: slow down
                    break;
                    case 410:
                      result.deleteDevice = true;
                    break;
                  }
                }
              }
            });
          }

          return callback(err, result);
        }
      });
  };

var createConnection = function(connectionOptions) {
    if (!_.has(connectionOptions, 'packageId')) {
      debug('connectionOptions.packageId missing');
      return null;
    }

    var hasCert = _.has(connectionOptions, 'cert');
    var hasTokenKey = _.has(connectionOptions, 'token.key');
    if (!hasCert && !hasTokenKey) {
      debug('connectionOptions.cert and .token.key both missing');
      return null;
    } else if (hasCert && hasTokenKey) {
      debug('connectionOptions.cert and .token.key both present');
      return null;
    }

    var connectionId = -1;
    _.forEach(connections, function(connection) {
        if (connection.options.packageId !== connectionOptions.packageId) {
          return;
        }

        var existingHasCert = _.has(connection.options, 'cert');
        var thisHasCert = _.has(connectionOptions, 'cert');
        if (existingHasCert !== thisHasCert ||
          (
            existingHasCert &&
            connection.options.cert !== connectionOptions.cert
          )
        ) {
          return;
        }

        var existingHasTokenKey = _.has(connection.options, 'token.key');
        var thisHasTokenKey = _.has(connectionOptions, 'token.key');
        if (existingHasTokenKey !== thisHasTokenKey ||
          (
            existingHasTokenKey &&
            connection.options.token.key !== connectionOptions.token.key
          )
        ) {
          return;
        }

        connectionId = connection.id;
      });

    if (connectionId === -1) {
      if (config.apn.connectionTtlInMs > 0) {
        pusher._cleanUpConnections(config.apn.connectionTtlInMs);
      }

      var provider = new lib.Provider(connectionOptions);
      var ac = {
          id: connectionCount++,
          options: connectionOptions,
          sentCount: 0,
          failedCount: 0,

          provider: provider,
          lastUsed: _.now()
        };

      connections[ac.id] = ac;
      connectionId = ac.id;
    } else {
      connections[connectionId].lastUsed = _.now();
    }

    return connections[connectionId];
  };
