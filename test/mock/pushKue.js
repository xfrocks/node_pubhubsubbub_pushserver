'use strict';

const pushKue = exports;
const _ = require('lodash');

let queues = {};
let processCallbacks = {};
pushKue._reset = function() {
    queues = {};
    processCallbacks = {};
  };

pushKue._getLatestJob = function(queueId) {
    if (!_.has(queues, queueId)) {
      return null;
    }

    return _.last(queues[queueId]);
  };

pushKue._getJobs = function(queueId) {
    if (!_.has(queues, queueId)) {
      return [];
    }

    return queues[queueId];
  };

pushKue.create = function(queueId, jobData) {
    const job = {
        data: jobData,
        error: null,
        result: null,

        delay: 0,
        ttl: 1000,
        remoteOnComplete: false,

        logs: [],
        log: function(...args) {
            job.logs.push(args);
          },
      };

    const attempt = function() {
        if (!_.has(processCallbacks, queueId)) {
          return;
        }

        processCallbacks[queueId](job, function(err, result) {
            job.error = err;
            job.result = result;
          });
      };

    return {
        delay: function(n) {
            job.delay = n;
          },
        ttl: function(n) {
            job.ttl = n;
          },
        removeOnComplete: function(b) {
            job.removeOnComplete = b;
          },

        save: function(callback) {
            if (job.data.device_type === 'save' &&
                job.data.device_ids[0] === 'error'
            ) {
              return callback('job.save error');
            }

            if (!_.has(queues, queueId)) {
              queues[queueId] = [];
            }
            queues[queueId].push(job);

            callback();
            attempt();
          },
      };
  };

pushKue.process = function(queueId, parallel, callback) {
    processCallbacks[queueId] = callback;
  };
