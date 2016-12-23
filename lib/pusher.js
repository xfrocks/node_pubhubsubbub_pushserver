'use strict';

var pusher = exports;
var config = require('./config');
var debug = require('debug')('pushserver:pusher');
var _ = require('lodash');

var gcm;
var wns;
var deviceDb;
pusher.setup = function(_apn, _gcm, _wns, _deviceDb) {
    if (_apn) {
      pusher._apnPusher = require('./pusher/apn').setup(config, _apn);
    }

    gcm = _gcm;
    wns = _wns;
    deviceDb = _deviceDb;

    return pusher;
  };

pusher.apn = function(connectionOptions, token, payload, callback) {
    if (!pusher._apnPusher) {
      debug('_apnPusher missing');
      return null;
    }

    return pusher._apnPusher.send(connectionOptions, token, payload, callback);
  };

pusher.gcm = function(gcmKey, registrationId, data, callback) {
    if (!gcm) {
      debug('gcm missing');
      return callback('Unable to create GCM sender');
    }

    var sender = new gcm.Sender(gcmKey);

    var message = new gcm.Message(config.gcm.messageOptions);
    message.addDataWithObject(data);

    sender.send(message, [registrationId], 1, function(err, result) {
        if (_.isFunction(callback)) {
          return callback(err, result);
        }
      });
  };

// store access tokens in memory only
var wnsAccessTokens = [];
pusher.wns = function(clientId, clientSecret, channelUri, dataRaw, callback) {
    if (!wns) {
      debug('wns missing');
      return callback('Unable to send data to WNS');
    }

    var options = {
        client_id: clientId,
        client_secret: clientSecret
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
