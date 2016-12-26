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
    let remainingAttempts = 1;

    const job = {
        data: jobData,
        error: null,
        result: null,

        attempts: 0,
        backOff: null,
        ttl: 1000,
        remoteOnComplete: false,

        logs: [],
        log: function(...args) {
            job.logs.push(args);
          },
      };

    const attempt = function() {
        if (!_.isFunction(processCallbacks[queueId])) {
          return;
        }

        job.attempts++;

        processCallbacks[queueId](job, function(err, result) {
            if (err) {
              job.error = err;
              job.result = null;
              remainingAttempts--;
              if (remainingAttempts > 0) {
                attempt();
              }

              return;
            }

            job.error = null;
            job.result = result;
          });
      };

    return {
        attempts: function(n) {
            remainingAttempts = n;
          },
        backoff: function(o) {
            job.backOff = o;
          },
        ttl: function(n) {
            job.ttl = n;
          },
        removeOnComplete: function(b) {
            job.removeOnComplete = b;
          },

        save: function(callback) {
            if (job.data.device_type === 'save' &&
                job.data.device_id === 'error'
            ) {
              return callback('job.save error');
            }

            if (!_.has(queues, queueId)) {
              queues[queueId] = [];
            }
            queues[queueId].push(job);

            if (_.isFunction(callback)) {
              callback();
            }

            attempt();
          },
      };
  };

pushKue.process = function(queueId, parallel, callback) {
    processCallbacks[queueId] = callback;
  };
