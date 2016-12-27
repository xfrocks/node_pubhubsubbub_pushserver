'use strict';

const pushQueue = exports;
const config = require('./config');
const helper = require('./helper');
const debug = require('debug')('pushserver:pushQueue');
const _ = require('lodash');

let pushKue = null;
let pusher = null;
let db = null;
let stats = {
  queued: 0,
  processed: 0,
};
pushQueue.setup = function(_pushKue, _pusher, _db) {
    pushKue = _pushKue;
    if (pushKue) {
      pushKue.process(config.pushQueue.queueId, 1, pushQueue._onJob);
    }

    pusher = _pusher;
    db = _db;
    stats.queued = 0;
    stats.processed = 0;

    return pushQueue;
  };

pushQueue.stats = function() {
  return pusher.stats().then((merged) => {
    merged.pushQueue = _.cloneDeep(stats);
    return merged;
  });
};

pushQueue.createQueue = function(kue) {
    let prefix = config.pushQueue.prefix;
    if (_.has(process.env, 'NODE_ENV')) {
      prefix += process.env.NODE_ENV;
    }

    const q = kue.createQueue({
        disableSearch: true,
        jobEvents: false,
        prefix: prefix,
        redis: config.redis,
    });
    q.watchStuckJobs(1000);

    return q;
  };

pushQueue.enqueue = function(deviceType, deviceId, payload, extraData) {
    const job = pushKue.create(config.pushQueue.queueId, {
        title: deviceType + ' ' + deviceId,
        device_type: deviceType,
        device_id: deviceId,
        payload: payload,
        extra_data: extraData,
      });

    if (config.pushQueue.attempts > 0) {
      job.attempts(config.pushQueue.attempts);
      job.backoff({type: 'exponential'});
    }
    job.ttl(config.pushQueue.ttlInMs);
    job.removeOnComplete(true);

    job.save(function(err) {
        if (err) {
          return debug('Error enqueuing', deviceType, deviceId, err);
        }

        stats.queued++;
      });
  };

pushQueue._onJob = function(job, jobCallback) {
    stats.processed++;

    const jobDone = helper.later(jobCallback);
    const done = function(err, result) {
        if (!err) {
          debug('Pushed', job.data.device_type, job.data.device_id);
          return jobDone();
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
        if (info.retry && !info.deleteDevice) {
          return jobDone(err);
        }

        if (info.deleteDevice) {
          return db.devices.delete(
            job.data.device_type,
            job.data.device_id,
            null, null,
            function() {
              jobDone(null, info);
            }
          );
        }

        return jobDone(null, info);
      };

    switch (job.data.device_type) {
      case 'android':
        return pushQueue._onAndroidJob(job, done);
      case 'ios':
        return pushQueue._oniOSJob(job, done);
      case 'windows':
        return pushQueue._onWindowsJob(job, done);
    }

    return done('Unrecognized device type ' + job.data.device_type);
  };

pushQueue._onAndroidJob = function(job, callback) {
    const done = helper.later(callback);
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
        return done('extra_data.package is missing', {deleteDevice: true});
      }

      db.projects.findConfig(
        'gcm',
        senderOptions.packageId,
        function(projectConfig) {
          if (!projectConfig || !projectConfig.api_key) {
            return done('Project not found', {deleteDevice: true});
          }

          senderOptions.gcmKey = projectConfig.api_key;

          try {
            pusher.gcm(senderOptions, data.device_id, gcmPayload, callback);
          } catch (e) {
            debug('Error pushing via GCM', e);
            done('Unable to push via GCM');
          }
        });
    }
  };

pushQueue._oniOSJob = function(job, callback) {
    const done = helper.later(callback);
    const data = job.data;

    if (!data.payload.notification_html) {
      return done('payload.notification_html is missing', {retry: false});
    }

    const message = helper.stripHtml(data.payload.notification_html);
    const apnMessage = helper.prepareApnMessage(message);
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
        return done('extra_data.package is missing', {deleteDevice: true});
      }

      db.projects.findConfig('apn', packageId, function(projectConfig) {
          if (!projectConfig) {
            return done('Project not found', {deleteDevice: true});
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
            done('Unable to push via APN');
          }
        });
    }
  };

pushQueue._onWindowsJob = function(job, callback) {
    const done = helper.later(callback);
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
      return done('channel_uri is missing');
    }
    const payloadJson = JSON.stringify(payload);

    if (clientId && clientSecret) {
      pusher.wns(clientId, clientSecret, channelUri, payloadJson, callback);
    } else {
      if (!packageId) {
        return done('extra_data.package is missing');
      }

      db.projects.findConfig('wns', packageId, function(projectConfig) {
          if (!projectConfig ||
              !projectConfig.client_id ||
              !projectConfig.client_secret) {
            return done('Project could not be found', packageId);
          }

          try {
            pusher.wns(projectConfig.client_id, projectConfig.client_secret,
              channelUri, payloadJson, callback);
          } catch (e) {
            debug('Error pushing via WNS', e);
            done('Unable to push via WNS');
          }
        });
    }
  };
