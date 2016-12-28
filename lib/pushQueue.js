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
    const prefix = helper.appendNodeEnv(config.pushQueue.prefix);
    const q = kue.createQueue({
        disableSearch: true,
        jobEvents: false,
        prefix: prefix,
        redis: config.redis,
    });
    q.watchStuckJobs(1000);

    return q;
  };

pushQueue.enqueue = function(deviceType, deviceIds, payload, extraData) {
    if (_.isString(deviceIds)) {
      deviceIds = [deviceIds];
    }

    let jobTitle = deviceType;
    if (_.has(extraData, '_ping__client_id') &&
      _.has(extraData, '_ping__topic')
    ) {
      jobTitle = extraData._ping__client_id +
        '/' + extraData._ping__topic +
        ' ' + deviceType;
    }
    if (deviceIds.length == 1) {
      jobTitle += '-' + deviceIds[0];
    } else {
      jobTitle += 'x' + deviceIds.length;
    }

    let delay = 0;
    if (_.has(extraData, '_pushQueue__attempted')) {
      if (extraData._pushQueue__attempted >= config.pushQueue.attempts) {
        return false;
      }

      const powOf2 = Math.pow(2, extraData._pushQueue__attempted - 1);
      delay = config.pushQueue.delayInMs * powOf2;
    }

    const job = pushKue.create(config.pushQueue.queueId, {
        title: jobTitle,
        device_type: deviceType,
        device_ids: deviceIds,
        payload: payload,
        extra_data: extraData,
      });
    job.delay(delay);
    job.ttl(config.pushQueue.ttlInMs);
    job.removeOnComplete(true);

    job.save(function(err) {
        if (err) {
          return debug('Error enqueuing', deviceType, deviceIds, err);
        }

        stats.queued++;
      });

    return true;
  };

pushQueue._onJob = function(job, jobCallback) {
    stats.processed++;

    const jobDone = helper.later(jobCallback);
    const done = function(err, pusherResult) {
        if (!err) {
          debug('Pushed', job.data.title);
          return jobDone();
        }

        if (!(err instanceof Error)) {
          err = new Error(err);
        }

        debug('Error pushing', job.data.title, err.message, pusherResult);

        const result = {
          retries: [],
          invalids: [],
        };
        _.merge(result, _.pick(pusherResult, _.keys(result)));

        if (_.has(result, 'retries') && result.retries.length > 0) {
          const retryExtraData = _.merge({}, job.data.extra_data);
          if (_.has(retryExtraData, '_pushQueue__attempted')) {
            retryExtraData._pushQueue__attempted++;
          } else {
            retryExtraData._pushQueue__attempted = 1;
          }

          pushQueue.enqueue(
            job.data.device_type,
            result.retries,
            job.data.payload,
            retryExtraData
          );
        }

        let invalids = [];
        if (_.has(result, 'invalids')) {
          invalids = _.clone(result.invalids);
        }

        const deleteInvalid = () => {
          if (invalids.length > 0) {
            const deviceId = invalids.shift();
            db.devices.delete(job.data.device_type, deviceId,
              null, null, deleteInvalid);
          }

          jobDone(null, result);
        };

        deleteInvalid();
      };

    try {
      switch (job.data.device_type) {
        case 'android':
          return pushQueue._onAndroidJob(job, done);
        case 'ios':
          return pushQueue._oniOSJob(job, done);
        case 'windows':
          return pushQueue._onWindowsJob(job, done);
      }

      return done('Unrecognized device type ' + job.data.device_type);
    } catch (e) {
      debug(e);
      return done('Cannot invoke pusher');
    }
  };

pushQueue._onAndroidJob = function(job, callback) {
    const done = helper.later(callback);
    const data = job.data;
    const payload = helper.prepareGcmPayload(data.payload);

    // TODO: remove default connection options support
    const senderOptions = {
      packageId: config.gcm.defaultKeyId,
      apiKey: '',
    };
    if (_.has(data, 'extra_data.package')) {
      senderOptions.packageId = data.extra_data.package;
    }
    if (senderOptions.packageId &&
      _.has(config.gcm.keys, senderOptions.packageId)
    ) {
      senderOptions.apiKey = config.gcm.keys[senderOptions.packageId];
    }

    if (senderOptions.apiKey) {
      return pusher.gcm(senderOptions, data.device_ids, payload, done);
    } else {
      if (!senderOptions.packageId) {
        return done('extra_data.package is missing',
          {invalids: data.device_ids});
      }
    }

    const packageId = senderOptions.packageId;
    db.projects.findConfig('gcm', packageId, (config) => {
        if (!config) {
          return done('Project not found', {invalids: data.device_ids});
        }

        const so = helper.prepareGcmSenderOptions(packageId, config);
        if (!so) {
          debug('Cannot prepare gcm sender options', packageId, config);
          return done('Project error');
        }

        return pusher.gcm(so, data.device_ids, payload, done);
      });
  };

pushQueue._oniOSJob = function(job, callback) {
    const done = helper.later(callback);
    const data = job.data;
    const payload = helper.prepareApnPayload(data.payload);
    if (!payload) {
      debug('Cannot prepare apn payload', data.payload);
      return done('Payload error');
    }

    // TODO: remove default connection options support
    let packageId = '';
    let connectionOptions = config.apn.connectionOptions;
    if (_.has(data, 'extra_data.package')) {
      packageId = data.extra_data.package;
      connectionOptions = null;
    }

    if (connectionOptions) {
      return pusher.apn(connectionOptions, data.device_ids, payload, done);
    } else {
      if (!packageId) {
        return done('extra_data.package is missing',
          {invalids: data.device_ids});
      }

      db.projects.findConfig('apn', packageId, function(config) {
          if (!config) {
            return done('Project not found', {invalids: data.device_ids});
          }

          const co = helper.prepareApnConnectionOptions(packageId, config);
          if (!co) {
            debug('Cannot prepare apn connection options', packageId, config);
            return done('Project error');
          }

          return pusher.apn(co, data.device_ids, payload, done);
        });
    }
  };

pushQueue._onWindowsJob = function(job, callback) {
    const done = function(err, pusherResult) {
      const result = {retries: [], invalids: []};

      if (_.has(pusherResult, 'retries') && _.has(pusherResult, 'invalids')) {
        result.retries = pusherResult.retries;
        result.invalids = pusherResult.invalids;
      } else if (_.has(pusherResult, 'deleteDevice') &&
        pusherResult.deleteDevice
      ) {
        result.invalids = job.data.device_ids;
      } else if (!_.has(pusherResult, 'retry') || pusherResult.retry) {
        result.retries = job.data.device_ids;
      }

      helper.later(callback)(err, result);
    };
    const data = job.data;
    const payload = helper.prepareWnsPayload(data.payload, data.extra_data);
    let packageId = '';
    let clientId = config.wns.client_id;
    let clientSecret = config.wns.client_secret;
    let channelUri = '';

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
        }
      });

    if (!channelUri) {
      return done('channel_uri is missing', {deleteDevice: true});
    }

    if (clientId && clientSecret) {
      return pusher.wns(clientId, clientSecret, channelUri, payload, done);
    } else {
      if (!packageId) {
        return done('extra_data.package is missing',
          {deleteDevice: true});
      }

      db.projects.findConfig('wns', packageId, function(config) {
          if (!config) {
            return done('Project could not be found',
              {deleteDevice: true});
          }

          if (!config.client_id || !config.client_secret) {
            return done('Project error');
          }

          return pusher.wns(config.client_id, config.client_secret,
            channelUri, payload, done);
        });
    }
  };
