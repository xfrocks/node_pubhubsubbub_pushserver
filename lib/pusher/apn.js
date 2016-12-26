'use strict';

const pusher = exports;
const _ = require('lodash');

let config;
let lib;
let connections = {};
let connectionCount = 0;
pusher.setup = function(_config, _lib) {
  config = _config;
  lib = _lib;
  connections = {};
  connectionCount = 0;

  return pusher;
};

pusher.stats = function() {
  return new Promise((resolve) => {
    const apn = {};

    _.forEach(connections, function(connection) {
      apn[connection.options.packageId] =
        _.pick(connection, ['sent', 'failed', 'invalid']);
    });

    resolve({apn});
  });
};

pusher.send = function(connectionOptions, token, payload, callback) {
    if (!lib) {
      return callback('lib missing');
    }

    if (!_.has(payload, 'aps.alert')) {
      return callback('payload.aps.alert missing');
    }

    const connection = createConnection(connectionOptions);
    if (connection === null) {
      return callback('Unable to create connection');
    }

    const filteredPayload = _.omit(payload, ['aps', 'expiry']);
    const notification = new lib.Notification(filteredPayload);
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
          if (!_.isFunction(callback)) {
            return;
          }

          let err = null;
          if (result.failed.length > 0) {
            _.forEach(result.failed, function(failed) {
              if (_.has(failed, 'error')) {
                err = failed.error;
              } else if (_.has(failed, 'response.reason')) {
                err = failed.response.reason;

                // https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html#//apple_ref/doc/uid/TP40008194-CH11-SW2
                switch (failed.response.reason) {
                  case 'BadDeviceToken':
                  case 'DeviceTokenNotForTopic':
                  case 'TopicDisallowed':
                  case 'Unregistered':
                    result.deleteDevice = true;
                  break;
                  case 'TooManyRequests':
                    // TODO: slow down
                  break;
                }
              } else {
                err = 'Unknown error';
              }

              if (_.has(failed, 'status') &&
                _.inRange(parseInt(failed.status), 400, 500)
              ) {
                if (!err) {
                  err = failed.status;
                }
                result.retry = false;
              }
            });
          }

          doStats(connection, result);

          return callback(err, result);
        });
  };

pusher._cleanUpConnections = function(ttlInMs) {
    const cutoff = _.now() - ttlInMs;

    _.pickBy(connections, function(c) {
        if (c.lastUsed < cutoff) {
          c.provider.shutdown();
          return false;
        }

        // keep this connection
        return true;
      });
  };

const createConnection = function(connectionOptions) {
    if (!_.has(connectionOptions, 'packageId')) {
      return null;
    }

    const hasCert = _.has(connectionOptions, 'cert');
    const hasTokenKey = _.has(connectionOptions, 'token.key');
    if (!hasCert && !hasTokenKey) {
      return null;
    } else if (hasCert && hasTokenKey) {
      return null;
    }

    let connectionId = -1;
    _.forEach(connections, function(connection) {
        if (connection.options.packageId !== connectionOptions.packageId) {
          return;
        }

        const existingHasCert = _.has(connection.options, 'cert');
        const thisHasCert = _.has(connectionOptions, 'cert');
        if (existingHasCert !== thisHasCert ||
          (
            existingHasCert &&
            connection.options.cert !== connectionOptions.cert
          )
        ) {
          return;
        }

        const existingHasTokenKey = _.has(connection.options, 'token.key');
        const thisHasTokenKey = _.has(connectionOptions, 'token.key');
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

      const provider = new lib.Provider(connectionOptions);
      const ac = {
          id: connectionCount++,
          options: connectionOptions,
          sent: 0,
          failed: 0,
          invalid: 0,

          provider: provider,
          lastUsed: _.now(),
        };

      connections[ac.id] = ac;
      connectionId = ac.id;
    } else {
      connections[connectionId].lastUsed = _.now();
    }

    return connections[connectionId];
  };

const doStats = function(connection, result) {
  connection.sent += result.sent.length;
  connection.failed += result.failed.length;

  if (_.has(result, 'deleteDevice') && result.deleteDevice) {
    connection.invalid++;
  }
};
