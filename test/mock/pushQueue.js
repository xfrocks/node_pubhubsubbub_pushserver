'use strict';

const pushQueue = exports;

let latestJob = null;
let jobs = [];
pushQueue._reset = function() {
    latestJob = null;
    jobs = [];
  };

pushQueue._getLatestJob = function() {
    return latestJob;
  };

pushQueue._getJobs = function() {
    return jobs;
  };

pushQueue.enqueue = function(deviceType, deviceIds, payload, extraData) {
    latestJob = {
        deviceType,
        deviceIds,
        payload,
        extraData,
      };

    jobs.push(latestJob);
  };
