'use strict';

var pusher = exports;
var _ = require('lodash');

var config;
var lib;
pusher.setup = function(_config, _lib) {
  config = _config;
  lib = _lib;

  return pusher;
};

pusher.send = function(gcmKey, registrationToken, data, callback) {
  if (!lib) {
    return callback('lib missing');
  }

  var sender = new lib.Sender(gcmKey);
  var message = new lib.Message(config.gcm.messageOptions);
  message.addData(data);
  var recipient = {
    to: registrationToken
  };
  var options = {
    retries: 0
  };

  sender.send(message, recipient, options, function(err, result) {
      if (_.isFunction(callback)) {
        return callback(err, result);
      }
    });
};
