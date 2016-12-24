'use strict';

var pubhubsubbub = exports;
var config = require('../config');
var helper = require('../helper');
var debug = require('debug')('pushserver:web');
var _ = require('lodash');
var request = require('request');
var url = require('url');
var stats = {
  subscribe: 0,
  unsubscribe: 0,
  unregister: 0,
  callback: {
    get: 0,
    post: 0
  }
};

pubhubsubbub.setup = function(app, prefix, db, pushQueue) {
    app.get(prefix + '/', function(req, res) {
        res.send('Hi, I am ' + pubhubsubbub._getCallbackUri(req, prefix));
      });

    if (!db) {
      return;
    }

    app.post(prefix + '/subscribe', function(req, res) {
        stats.subscribe++;

        var requiredKeys = [];
        requiredKeys.push('hub_uri');
        requiredKeys.push('oauth_client_id');
        requiredKeys.push('oauth_token');
        requiredKeys.push('device_type');
        requiredKeys.push('device_id');
        var data = helper.prepareSubscribeData(req.body, requiredKeys);
        if (!data.has_all_required_keys) {
          debug('POST /subscribe', 'data missing', data.missing_keys);
          return res.sendStatus(400);
        }

        var saveDevice = function() {
            db.devices.save(
                data.device_type, data.device_id,
                data.oauth_client_id, data.hub_topic,
                data.extra_data, function(isSaved) {
                    if (isSaved !== false) {
                      saveHub();
                    } else {
                      return res.sendStatus(500);
                    }
                  }
            );
          };

        var saveHub = function() {
          db.hubs.save(
            data.oauth_client_id,
            data.hub_uri,
            {},
            function(isSaved) {
              if (isSaved !== false) {
                sendPostRequestToHub();
              } else {
                return res.sendStatus(500);
              }
            });
        };

        var sendPostRequestToHub = function() {
            request.post({
                url: data.hub_uri,
                form: {
                    'hub.callback': pubhubsubbub._getCallbackUri(req, prefix),
                    'hub.mode': 'subscribe',
                    'hub.topic': data.hub_topic,

                    client_id: data.oauth_client_id,
                    oauth_token: data.oauth_token
                  }
              }, function(err, httpResponse, body) {
                if (httpResponse) {
                  var success = _.inRange(httpResponse.statusCode, 200, 300);
                  var txt = success ? 'succeeded' : (body || 'failed');

                  debug('POST /subscribe', data.device_type, data.device_id,
                    data.hub_uri, data.hub_topic, txt);
                  return res.status(httpResponse.statusCode).send(txt);
                } else {
                  debug('POST /subscribe', data.device_type, data.device_id,
                    data.hub_uri, data.hub_topic, err);
                  return res.sendStatus(503);
                }
              });
          };

        saveDevice();
      });

    app.post(prefix + '/unsubscribe', function(req, res) {
        stats.unsubscribe++;

        var requiredKeys = [];
        requiredKeys.push('hub_uri');
        requiredKeys.push('hub_topic');
        requiredKeys.push('oauth_client_id');
        requiredKeys.push('device_type');
        requiredKeys.push('device_id');
        var data = helper.prepareSubscribeData(req.body, requiredKeys);
        if (!data.has_all_required_keys) {
          debug('POST /unsubscribe', 'data missing', data.missing_keys);
          return res.sendStatus(400);
        }

        var deleteDevice = function() {
            db.devices.delete(
                data.device_type, data.device_id,
                data.oauth_client_id, data.hub_topic,
                function(isDeleted) {
                    if (isDeleted !== false) {
                      sendPostRequestToHub();
                    } else {
                      return res.sendStatus(500);
                    }
                  }
            );
          };

        var sendPostRequestToHub = function() {
            request.post({
                url: data.hub_uri,
                form: {
                    'hub.callback': pubhubsubbub._getCallbackUri(req, prefix),
                    'hub.mode': 'unsubscribe',
                    'hub.topic': data.hub_topic,

                    oauth_token: data.oauth_token,
                    client_id: data.oauth_client_id
                  }
              }, function(err, httpResponse, body) {
                if (httpResponse) {
                  var success = _.inRange(httpResponse.statusCode, 200, 300);
                  var txt = success ? 'succeeded' : (body || 'failed');

                  debug('POST /unsubscribe', data.device_type, data.device_id,
                    data.hub_uri, data.hub_topic, txt);
                  return res.status(httpResponse.statusCode).send(txt);
                } else {
                  debug('POST /unsubscribe', data.device_type, data.device_id,
                    data.hub_uri, data.hub_topic, err);
                  return res.sendStatus(503);
                }
              });
          };

        deleteDevice();
      });

    app.post(prefix + '/unregister', function(req, res) {
        stats.unregister++;

        var requiredKeys = [];
        requiredKeys.push('oauth_client_id');
        requiredKeys.push('device_type');
        requiredKeys.push('device_id');
        var data = helper.prepareSubscribeData(req.body, requiredKeys);
        if (!data.has_all_required_keys) {
          debug('POST /unregister', 'data missing', data.missing_keys);
          return res.sendStatus(400);
        }

        db.devices.delete(
            data.device_type, data.device_id,
            data.oauth_client_id, null,
            function(isDeleted) {
                debug('POST /unregister', data.device_type, data.device_id,
                  data.oauth_client_id, isDeleted);

                if (isDeleted !== false) {
                  return res.send('succeeded');
                } else {
                  return res.sendStatus(500);
                }
              }
        );
      });

    app.get(prefix + '/callback', function(req, res) {
        stats.callback.get++;

        var parsed = url.parse(req.url, true);

        if (!parsed.query.client_id) {
          debug('GET /callback', '`client_id` is missing');
          return res.sendStatus(401);
        }
        var clientId = parsed.query.client_id;

        if (!parsed.query['hub.challenge']) {
          debug('GET /callback', '`hub.challenge` is missing');
          return res.sendStatus(403);
        }

        if (!parsed.query['hub.mode']) {
          debug('GET /callback', '`hub.mode` is missing');
          return res.sendStatus(404);
        }
        var hubMode = parsed.query['hub.mode'];

        var hubTopic = parsed.query['hub.topic'] || '';

        db.devices.findDevices(clientId, hubTopic, function(devices) {
            var isSubscribe = (hubMode === 'subscribe');
            var devicesFound = devices.length > 0;

            if (isSubscribe !== devicesFound) {
              debug('GET /callback', 'Devices not found', clientId, hubTopic);
              return res.sendStatus(405);
            }

            return res.send(parsed.query['hub.challenge']);
          });
      });

    if (!pushQueue) {
      return;
    }

    app.post(prefix + '/callback', function(req, res) {
        stats.callback.post++;

        var error = false;

        _.forEach(req.body, function(ping) {
            if (!_.isObject(ping)) {
              debug('POST /callback', 'Unexpected data in callback', ping);
              error = true;
              return false;
            }

            var requiredKeys = ['client_id', 'topic', 'object_data'];
            if (!_.every(requiredKeys, _.partial(_.has, ping))) {
              debug('POST /callback', 'Insufficient data', _.keys(ping));
              error = true;
              return false;
            }

            db.devices.findDevices(
              ping.client_id,
              ping.topic,
              function(devices) {
                if (devices.length === 0) {
                  pubhubsubbub._findHubToUnsubscribe(
                    ping.client_id,
                    ping.topic,
                    db,
                    pubhubsubbub._getCallbackUri(req, prefix),
                    function(err) {
                      debug('POST /callback', 'Devices not found',
                        ping.client_id, ping.topic, err);
                    }
                  );
                }

                _.forEach(devices, function(device) {
                      pushQueue.enqueue(device.device_type, device.device_id,
                        ping.object_data, device.extra_data);
                    });
              });
          });

        return res.sendStatus(error ? 200 : 202);
      });

    return pubhubsubbub;
  };

pubhubsubbub.stats = function() {
  return {
    web: stats
  };
};

pubhubsubbub._getCallbackUri = function(req, prefix) {
    if (config.web.callback) {
      return config.web.callback;
    }

    return req.protocol + '://' + req.get('host') + prefix + '/callback';
  };

pubhubsubbub._findHubToUnsubscribe = function(
  oauthClientId,
  hubTopic,
  db,
  callbackUri,
  callback
) {
  var findHub = function() {
    db.hubs.findHub(oauthClientId, function(hub) {
      if (hub === null) {
        return done('Hub not found');
      }

      unsubscribe(hub);
    });
  };

  var unsubscribe = function(hub) {
    var count = hub.hub_uri.length;

    _.forEach(hub.hub_uri, function(hubUri) {
        request.post({
            url: hubUri,
            form: {
                'hub.callback': callbackUri,
                'hub.mode': 'unsubscribe',
                'hub.topic': hubTopic,
                client_id: oauthClientId
              }
          }, function(err, httpResponse, body) {
            if (httpResponse) {
              var success = _.inRange(httpResponse.statusCode, 200, 300);
              var txt = success ? 'succeeded' : (body || 'failed');
              if (txt !== 'succeeded') {
                err = 'failed';
              }

              debug('Auto-unsubscribe', hubUri, hubTopic, txt);
            } else {
              debug('Error auto-unsubscribe', hubUri, hubTopic, err);
            }

            count--;
            if (count === 0) {
              if (hub.hub_uri.length === 1) {
                done(err);
              } else {
                done();
              }
            }
          });
      });
  };

  var done = function(err) {
    if (_.isFunction(callback)) {
      callback(err);
    }
  };

  findHub();
};
