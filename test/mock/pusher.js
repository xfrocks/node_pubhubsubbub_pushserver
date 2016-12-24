'use strict';

var pusher = exports;
var _ = require('lodash');

var latestPush = null;
var pushes = [];

pusher._reset = function() {
    pushes = [];
  };

pusher._getLatestPush = function() {
    return latestPush;
  };

pusher._getPushes = function() {
    return pushes;
  };

var mock = function(push, hint, callback) {
    latestPush = push;
    pushes.push(push);

    var err = null;
    var info = {};

    switch (hint) {
      case 'error':
        err = 'Error';
      break;
      case 'Error':
        err = new Error('Message');
      break;
      case 'retry1':
        err = 'retry1-Error';
        if (pushes.length > 1) {
          info.retry = false;
        }
      break;
      case 'invalid':
        err = 'invalid';
        info.retry = false;
        info.deleteDevice = true;
      break;
    }

    if (_.isFunction(callback)) {
      callback(err, info);
    }
  };

pusher.apn = function(connectionOptions, token, payload, callback) {
    mock({
        type: 'apn',
        connectionOptions: connectionOptions,
        token: token,
        payload: payload
      }, token, callback);
  };

pusher.gcm = function(gcmKey, registrationId, data, callback) {
    mock({
        type: 'gcm',
        gcmKey: gcmKey,
        registrationId: registrationId,
        data: data
      }, registrationId, callback);
  };

pusher.wns = function(clientId, clientSecret, channelUri, dataRaw, callback) {
    mock({
        type: 'wns',
        clientId: clientId,
        clientSecret: clientSecret,
        channelUri: channelUri,
        dataRaw: dataRaw
      }, channelUri, callback);
  };
