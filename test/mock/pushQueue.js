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

pushQueue.enqueue = function(deviceType, deviceId, payload, extraData) {
    latestJob = {
        device_type: deviceType,
        device_id: deviceId,
        payload: payload,
        extra_data: extraData,
      };

    jobs.push(latestJob);
  };
