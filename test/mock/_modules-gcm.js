'use strict';

var gcm = exports;
var _ = require('lodash');

var latestPush = null;

gcm._getLatestPush = function() {
    return latestPush;
  };

gcm.Sender = function(gcmKey) {
    var sender = this;

    this.send = function(message, recipient, options, callback) {
        latestPush = {
          sender: sender,
          message: message,
          recipient: recipient,
          options: options
        };

        callback(null, {response: {foo: 'bar'}});
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
