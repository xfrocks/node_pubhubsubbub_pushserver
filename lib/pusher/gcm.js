'use strict';

const pusher = exports;
const _ = require('lodash');

let config;
let lib;
let stats = {};
pusher.setup = function(_config, _lib) {
  config = _config;
  lib = _lib;
  stats = {};

  return pusher;
};

pusher.stats = function() {
  return _.merge({}, stats);
};

pusher.send = function(senderOptions, registrationToken, data, callback) {
  if (!lib) {
    return callback('lib missing');
  }

  if (!_.has(senderOptions, 'gcmKey') || !senderOptions.gcmKey) {
    return callback('gcmKey missing');
  }

  const sender = new lib.Sender(senderOptions.gcmKey);
  const message = new lib.Message(config.gcm.messageOptions);
  message.addData(data);
  const recipient = {
    to: registrationToken,
  };

  sender.sendNoRetry(message, recipient, function(err, result) {
      if (!_.isFunction(callback)) {
        return;
      }

      if (!_.isObject(result)) {
        result = {};
      }

      if (_.isNumber(err) && _.inRange(err, 400, 500)) {
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
          case 'MissingRegistration':
          case 'InvalidRegistration':
          case 'NotRegistered':
          case 'InvalidPackageName':
          case 'MismatchSenderId':
            result.retry = false;
            result.deleteDevice = true;
          break;
          default:
            result.retry = false;
          break;
        }
      }

      doStats(senderOptions, err, result);

      return callback(err, result);
    });
};

const doStats = function(senderOptions, err, result) {
  const packageId = _.has(senderOptions, 'packageId') ?
    senderOptions.packageId : senderOptions.gcmKey;

  if (!_.has(stats, packageId)) {
    stats[packageId] = {
      sent: 0,
      failed: 0,
      invalid: 0,
    };
  }

  if (err) {
    stats[packageId].failed++;
  } else {
    stats[packageId].sent++;
  }

  if (_.has(result, 'deleteDevice') && result.deleteDevice) {
    stats[packageId].invalid++;
  }
};
