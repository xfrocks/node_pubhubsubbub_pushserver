'use strict';

const pushQueue = exports;
const config = require('./config');
const helper = require('./helper');
const debug = require('debug')('pushserver:pushQueue');
const _ = require('lodash');

let pushKue = null;
let pusher = null;
let projectDb = null;
let deviceDb = null;
let stats = {
  queued: 0,
  processed: 0,
};
pushQueue.setup = function(_pushKue, _pusher, _projectDb, _deviceDb) {
    pushKue = _pushKue;
    if (pushKue) {
      pushKue.process(config.pushQueue.queueId, 1, pushQueue._onJob);
    }

    pusher = _pusher;
    projectDb = _projectDb;
    deviceDb = _deviceDb;
    stats = {};

    return pushQueue;
  };

pushQueue.stats = function() {
  const merged = {
    pushQueue: _.merge({}, stats),
  };

  if (pusher) {
    merged.pusher = pusher.stats();
  }

  return merged;
};

pushQueue.enqueue = function(deviceType, deviceId, payload, extraData) {
    if (!pushKue) {
      debug('pushKue missing');
      return;
    }

    const job = pushKue.create(config.pushQueue.queueId, {
        title: deviceType + ' ' + deviceId,
        device_type: deviceType,
        device_id: deviceId,
        payload: payload,
        extra_data: extraData,
      });

    job.attempts(config.pushQueue.attempts);
    job.backoff({type: 'exponential'});
    job.ttl(config.pushQueue.ttlInMs);
    job.removeOnComplete(true);

    job.save(function(err) {
        if (err) {
          return debug('Error enqueuing', deviceType, deviceId, err);
        }

        stats.queued++;
      });
  };

pushQueue._onJob = function(job, done) {
    stats.processed++;

    const callback = function(err, result) {
        if (!err) {
          debug('Pushed', job.data.device_type, job.data.device_id);
          return done();
        }

        const info = {
          retry: true,
          deleteDevice: false,
        };
        _.merge(info, _.pick(result, _.keys(info)));
        if (!(err instanceof Error)) {
          err = new Error(err);
        }

        debug('Error pushing', job.data.device_type,
          job.data.device_id, err.message, info);
        if (info.retry) {
          return done(err);
        }

        if (info.deleteDevice) {
          return tryToDeleteDevice(
            job.data.device_type,
            job.data.device_id,
            function() {
              done(null, info);
            }
          );
        }

        return done(null, info);
      };

    const tryToDeleteDevice = function(type, id, callback) {
        if (!deviceDb) {
          debug('deviceDb missing');
          return callback();
        }

        deviceDb.delete(type, id, null, null, callback);
      };

    switch (job.data.device_type) {
      case 'android':
        return pushQueue._onAndroidJob(job, callback);
      case 'ios':
        return pushQueue._oniOSJob(job, callback);
      case 'windows':
        return pushQueue._onWindowsJob(job, callback);
    }

    return callback('Unrecognized device type ' + job.data.device_type);
  };

pushQueue._onAndroidJob = function(job, callback) {
    if (!pusher) {
      return callback('pusher missing');
    }

    const data = job.data;
    const gcmPayload = {};
    if (_.has(data.payload, 'action')) {
      gcmPayload.action = data.payload.action;
    }
    if (data.payload.notification_id > 0) {
      gcmPayload.notification_id = data.payload.notification_id;
      gcmPayload.notification =
        helper.stripHtml(data.payload.notification_html);
    } else {
      _.forEach(data.payload, function(dataPayload, i) {
          switch (i) {
          case 'notification_id':
          case 'notification_html':
            // ignore
          break;
          default:
            gcmPayload[i] = dataPayload;
        }
        });
    }

    const senderOptions = {
      packageId: config.gcm.defaultKeyId,
      gcmKey: '',
    };
    if (_.has(data, 'extra_data.package')) {
      senderOptions.packageId = data.extra_data.package;
    }
    if (senderOptions.packageId &&
      _.has(config.gcm.keys, senderOptions.packageId)
    ) {
      senderOptions.gcmKey = config.gcm.keys[senderOptions.packageId];
    }

    if (senderOptions.gcmKey) {
      pusher.gcm(senderOptions, data.device_id, gcmPayload, callback);
    } else {
      if (!senderOptions.packageId) {
        return callback('extra_data.package is missing');
      }

      if (!projectDb) {
        return callback('projectDb missing');
      }

      projectDb.findConfig(
        'gcm',
        senderOptions.packageId,
        function(projectConfig) {
          if (!projectConfig || !projectConfig.api_key) {
            return callback('Project not found', senderOptions.packageId);
          }

          senderOptions.gcmKey = projectConfig.api_key;

          try {
            pusher.gcm(senderOptions, data.device_id, gcmPayload, callback);
          } catch (e) {
            debug('Error pushing via GCM', e);
            callback('Unable to push via GCM');
          }
        });
    }
  };

pushQueue._oniOSJob = function(job, callback) {
    if (!pusher) {
      return callback('pusher missing');
    }

    const data = job.data;
    if (!data.payload.notification_html) {
      return callback('payload.notification_html is missing');
    }

    const message = helper.stripHtml(data.payload.notification_html);
    const apnMessage = helper.prepareApnMessage(message);
    if (!apnMessage) {
      return callback('No APN message');
    }
    const payload = {aps: {alert: apnMessage}};

    if (_.has(data, 'payload.user_unread_notification_count')) {
      payload.aps.badge = data.payload.user_unread_notification_count;
    }

    // TODO: remove default connection options support
    let packageId = '';
    let connectionOptions = config.apn.connectionOptions;
    if (_.has(data, 'extra_data.package')) {
      packageId = data.extra_data.package;
      connectionOptions = null;
    }

    if (connectionOptions) {
      pusher.apn(connectionOptions, data.device_id, payload, callback);
    } else {
      if (!packageId) {
        return callback('extra_data.package is missing');
      }

      if (!projectDb) {
        return callback('projectDb missing');
      }

      projectDb.findConfig('apn', packageId, function(projectConfig) {
          if (!projectConfig) {
            return callback('Project could not be found', packageId);
          }

          const connectionOptions = {
              packageId: packageId,
            };

          _.forEach(projectConfig, function(configValue, configKey) {
              switch (configKey) {
              case 'address':
              case 'gateway':
                connectionOptions.address = configValue;
              break;
              case 'cert':
              case 'cert_data':
                connectionOptions.cert = configValue;
              break;
              case 'key':
              case 'key_data':
                connectionOptions.key = configValue;
              break;
              default:
                connectionOptions[configKey] = configValue;
            }
            });

          try {
            pusher.apn(connectionOptions, data.device_id, payload, callback);
          } catch (e) {
            debug('Error pushing via APN', e);
            callback('Unable to push via APN');
          }
        });
    }
  };

pushQueue._onWindowsJob = function(job, callback) {
    if (!pusher) {
      return callback('pusher missing');
    }

    const data = job.data;
    const payload = data.payload;
    let packageId = '';
    let clientId = config.wns.client_id;
    let clientSecret = config.wns.client_secret;
    let channelUri = '';

    payload.extra_data = {};
    _.forEach(data.extra_data, function(value, key) {
        switch (key) {
        case 'channel_uri':
          channelUri = value;
        break;
        case 'package':
          packageId = value;
          clientId = '';
          clientSecret = '';
        break;
        default:
          payload.extra_data[key] = value;
      }
      });

    if (!channelUri) {
      return callback('channel_uri is missing');
    }
    const payloadJson = JSON.stringify(payload);

    if (clientId && clientSecret) {
      pusher.wns(clientId, clientSecret, channelUri, payloadJson, callback);
    } else {
      if (!packageId) {
        return callback('extra_data.package is missing');
      }

      if (!projectDb) {
        return callback('projectDb missing');
      }

      projectDb.findConfig('wns', packageId, function(projectConfig) {
          if (!projectConfig ||
              !projectConfig.client_id ||
              !projectConfig.client_secret) {
            return callback('Project could not be found', packageId);
          }

          try {
            pusher.wns(projectConfig.client_id, projectConfig.client_secret,
              channelUri, payloadJson, callback);
          } catch (e) {
            debug('Error pushing via WNS', e);
            callback('Unable to push via WNS');
          }
        });
    }
  };
