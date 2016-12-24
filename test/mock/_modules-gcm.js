'use strict';

var gcm = exports;
var _ = require('lodash');

var latestPush = null;

gcm._getLatestPush = function() {
    return latestPush;
  };

gcm.Sender = function(gcmKey) {
    var sender = this;

    this.sendNoRetry = function(message, recipient, callback) {
        latestPush = {
          sender: sender,
          message: message,
          recipient: recipient
        };

        var error = null;
        var response = {
          multicast_id: 123,
          success: 1,
          failure: 0,
          canonical_ids: 0,
          results: [{message_id: 'mi'}]
        };
        var messageData = message._getData();
        if (_.has(messageData, 'error')) {
          error = messageData.error;
        }
        if (_.has(messageData, 'responseErrorResult')) {
          response.success = 0;
          response.failure = 1;
          response.results[0] = messageData.responseErrorResult;
        }

        callback(error, response);
      };

    this._getGcmKey = function() {
      return gcmKey;
    };
  };

gcm.Message = function(options) {
    this.options = options;
    var data = {};

    this.addData = function(newData) {
      _.merge(data, newData);
    };

    this._getData = function() {
      return data;
    };
  };
