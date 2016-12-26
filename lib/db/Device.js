'use strict';

const debug = require('debug')('pushserver:db:Device');
const _ = require('lodash');

exports = module.exports = function(mongoose) {
    const deviceSchema = new mongoose.Schema({
      device_type: {type: String, required: true},
      device_id: {type: String, required: true},
      oauth_client_id: {type: String, required: true, index: true},
      hub_topic: {type: [String], default: []},
      extra_data: {type: Object, default: {}},
    });
    deviceSchema.index({device_type: 1, device_id: 1});
    deviceSchema.index({oauth_client_id: 1, hub_topic: 1});
    deviceSchema.index({device_type: 1, device_id: 1, oauth_client_id: 1},
      {unique: true});
    const DeviceModel = mongoose.model('devices', deviceSchema);
    const stats = {
      inserted: 0,
      updated: 0,
      deleted: 0,
    };

    return {
        _model: DeviceModel,

        stats: function() {
            return DeviceModel.count().exec().then(function(count) {
              return {devices: _.merge({count}, stats)};
            });
          },

        save: function(deviceType, deviceId,
          oauthClientId, hubTopic,
          extraData, callback) {
            const tryUpdating = function() {
                DeviceModel.findOne({
                    device_type: deviceType,
                    device_id: deviceId,
                    oauth_client_id: oauthClientId,
                  }, function(err, device) {
                    if (err || !device) {
                      return updateFailed(err);
                    }

                    let changed = false;

                    if (device.hub_topic.indexOf(hubTopic) === -1) {
                      device.hub_topic.push(hubTopic);
                      changed = true;
                    }

                    const newExtraData = _.merge({},
                      device.extra_data, extraData);
                    if (!_.isEqual(device.extra_data, newExtraData)) {
                      device.extra_data = newExtraData;
                      changed = true;
                    }

                    if (!changed) {
                      return nopDone();
                    }

                    device.save(function(err, updatedDevice) {
                        if (!err && updatedDevice) {
                          updateDone(updatedDevice);
                        } else {
                          updateFailed(err);
                        }
                      });
                  });
              };

            const tryInserting = function() {
                const device = new DeviceModel({
                    device_type: deviceType,
                    device_id: deviceId,
                    oauth_client_id: oauthClientId,
                    hub_topic: [hubTopic],
                    extra_data: extraData,
                  });

                device.save(function(err, insertedDevice) {
                    if (!err) {
                      insertDone(insertedDevice);
                    } else {
                      insertFailed(err);
                    }
                  });
              };

            const nopDone = function() {
                done('nop');
              };

            const updateDone = function(device) {
                stats.updated++;
                debug('Updated', deviceType, deviceId, device._id);
                done('updated');
              };

            const updateFailed = function(err) {
                if (err) {
                  debug('Unable to update', deviceType, deviceId, err);
                }
                tryInserting();
              };

            const insertDone = function(device) {
                stats.inserted++;
                debug('Saved', deviceType, deviceId, device._id);
                done('inserted');
              };

            const insertFailed = function(err) {
                debug('Unable to insert', deviceType, deviceId, err);
                done(false);
              };

            const done = function(result) {
                if (_.isFunction(callback)) {
                  callback(result);
                }
              };

            tryUpdating();
          },

        findDevices: function(oauthClientId, hubTopic, callback) {
            const done = function(devices) {
                if (_.isFunction(callback)) {
                  callback(devices);
                }
              };

            let query = {oauth_client_id: oauthClientId};
            if (hubTopic) {
              query.hub_topic = hubTopic;
            }

            DeviceModel.find(query, function(err, devices) {
                if (!err) {
                  done(devices);
                } else {
                  debug('Error finding', oauthClientId, hubTopic, err);
                  done([]);
                }
              });
          },

        delete: function(deviceType, deviceId,
          oauthClientId, hubTopic, callback) {
            const tryUpdating = function() {
                let query = {
                    device_type: deviceType,
                    device_id: deviceId,
                  };
                if (oauthClientId) {
                  query.oauth_client_id = oauthClientId;
                }

                DeviceModel.find(query, function(err, devices) {
                    if (err) {
                      return deleteFailed(err);
                    }

                    if (oauthClientId) {
                      const device = _.first(devices);
                      if (!device) {
                        return deleteFailed('Device could not be found.');
                      }

                      if (hubTopic) {
                        device.hub_topic =
                          _.without(device.hub_topic, hubTopic);
                        device.save(function(err) {
                            if (!err) {
                              updateDone();
                            } else {
                              deleteFailed(err);
                            }
                          });
                      } else {
                        device.remove(function(err) {
                            if (!err) {
                              removeDone();
                            } else {
                              deleteFailed(err);
                            }
                          });
                      }
                    } else {
                      const internalIds = [];
                      _.forEach(devices, function(_device) {
                          internalIds.push(_device._id);
                        });

                      DeviceModel.remove({_id: {$in: internalIds}},
                        function(err) {
                          if (!err) {
                            removeAllDone(internalIds.length);
                          } else {
                            deleteFailed(err);
                          }
                        });
                    }
                  });
              };

            const updateDone = function() {
                stats.updated++;
                debug('Deleted', deviceType, deviceId, hubTopic);
                done('updated');
              };

            const removeDone = function() {
                stats.deleted++;
                debug('Deleted', deviceType, deviceId);
                done('removed');
              };

            const removeAllDone = function(count) {
                stats.deleted += count;
                debug('Deleted', deviceType, deviceId);
                done('removed_all');
              };

            const deleteFailed = function(err) {
                debug('Unable to delete', deviceType, deviceId,
                  oauthClientId, hubTopic || 'N/A', err);
                done(false);
              };

            const done = function(result) {
                if (_.isFunction(callback)) {
                  callback(result);
                }
              };

            tryUpdating();
          },
      };
  };
