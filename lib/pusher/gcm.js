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

  sender.sendNoRetry(message, recipient, function(err, result) {
      if (_.isFunction(callback)) {
        if (err && typeof err === 'number' && err >= 400 && err < 500) {
          result.retry = false;
        }

        if (_.has(result, 'results') &&
          result.results.length > 0 &&
          _.has(result.results[0], 'error')
        ) {
          // https://developers.google.com/cloud-messaging/http-server-ref#error-codes
          err = result.results[0].error;
          switch (err) {
            case 'Unavailable':
            case 'InternalServerError':
              // can still retry with these errors
            break;
            case 'DeviceMessageRate Exceeded':
            case 'TopicsMessageRate Exceeded':
              // TODO: slow down
            break;
            default:
              result.retry = false;
            break;
          }
        }

        return callback(err, result);
      }
    });
};
