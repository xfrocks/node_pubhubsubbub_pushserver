'use strict';

const pusher = exports;
const config = require('./config');
const debug = require('debug')('pushserver:pusher');
const _ = require('lodash');

let wns;
pusher.setup = function(_apn, _gcm, _wns) {
    if (_apn) {
      pusher._apnPusher = require('./pusher/apn').setup(config, _apn);
    } else {
      pusher._apnPusher = null;
    }

    if (_gcm) {
      pusher._gcmPusher = require('./pusher/gcm').setup(config, _gcm);
    } else {
      pusher._gcmPusher = null;
    }

    wns = _wns;

    return pusher;
  };

pusher.setupDefault = function() {
    return pusher.setup(
      require('apn'),
      require('node-gcm'),
      require('wns')
    );
  };

pusher.stats = function() {
  const stats = {};

  if (pusher._apnPusher) {
    stats.apn = pusher._apnPusher.stats();
  }

  if (pusher._gcmPusher) {
    stats.gcm = pusher._gcmPusher.stats();
  }

  return stats;
};

pusher.apn = function(connectionOptions, token, payload, callback) {
    if (!pusher._apnPusher) {
      debug('_apnPusher missing');
      return null;
    }

    return pusher._apnPusher.send(connectionOptions, token, payload, callback);
  };

pusher.gcm = function(gcmKey, registrationToken, data, callback) {
    if (!pusher._gcmPusher) {
      debug('_gcmPusher missing');
      return null;
    }

    return pusher._gcmPusher.send(gcmKey, registrationToken, data, callback);
  };

// store access tokens in memory only
const wnsAccessTokens = [];
pusher.wns = function(clientId, clientSecret, channelUri, dataRaw, callback) {
    if (!wns) {
      debug('wns missing');
      return callback('Unable to send data to WNS');
    }

    const options = {
        client_id: clientId,
        client_secret: clientSecret,
      };
    if (_.isString(wnsAccessTokens[clientId])) {
      options.accessToken = wnsAccessTokens[clientId];
    }

    wns.sendRaw(channelUri, dataRaw, options, function(err, result) {
        if (err) {
          if (err.newAccessToken) {
            debug('wns', 'updated access token (from error)');
            wnsAccessTokens[clientId] = err.newAccessToken;
          }
        } else if (result) {
          if (result.newAccessToken) {
            debug('wns', 'updated access token (from result)');
            wnsAccessTokens[clientId] = result.newAccessToken;
          }
        }

        if (_.isFunction(callback)) {
          return callback(err, result);
        }
      });
  };
