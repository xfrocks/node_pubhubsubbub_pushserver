'use strict';

var apn = exports;
var _ = require('lodash');

var providers = [];
var feedbacks = [];
var latestPush = null;
var pushes = [];

apn._reset = function() {
    providers = [];
    feedbacks = [];
    latestPush = null;
    pushes = [];
  };

apn._getLatestPush = function() {
    return latestPush;
  };

apn._getPushes = function() {
    return pushes;
  };

apn._getProviderCount = function() {
    return providers.length;
  };

apn.Provider = function(options) {
    var provider = this;
    this.options = options;
    this._hasBeenShutdown = false;

    this.send = function(notification, recipients) {
        return new global.Promise(function(fulfill) {
          var result = {sent: [], failed: []};

          _.forEach(recipients, function(recipient) {
            latestPush = {
              provider: provider,
              recipient: recipient,
              notification: notification
            };
            pushes.push(latestPush);

            switch (recipient) {
              case 'fail-string':
                result.failed.push({
                  device: recipient,
                  status: '400',
                  response: {
                    reason: 'Reason'
                  }
                });
              break;
              case 'fail-Error':
                result.failed.push({
                  device: recipient,
                  error: new Error('Error')
                });
              break;
              case 'fail-unknown':
                result.failed.push({device: recipient});
              break;
              default:
                result.sent.push(recipient);
            }
          });

          fulfill(result);
        });
      };

    this.shutdown = function() {
        this._hasBeenShutdown = true;
      };

    providers.push(this);
  };

apn.Notification = function(payload) {
    this.payload = payload;
    this.alert = '';
    this.badge = '';
    this.sound = '';

    this.topic = '';
    this.expiry = null;
  };
