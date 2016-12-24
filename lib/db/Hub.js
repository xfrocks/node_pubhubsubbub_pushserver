'use strict';

var debug = require('debug')('pushserver:db:Hub');
var _ = require('lodash');

exports = module.exports = function(mongoose) {
    var hubSchema = new mongoose.Schema({
        oauth_client_id: {type: String, required: true,
          index: true, unique: true},
        hub_uri: {type: [String], default: []},
        extra_data: {type: Object, default: {}}
      });
    var HubModel = mongoose.model('hubs', hubSchema);

    return {
        _model: HubModel,

        save: function(oauthClientId, hubUri, extraData, callback) {
            var tryUpdating = function() {
                HubModel.findOne({
                    oauth_client_id: oauthClientId
                  }, function(err, hub) {
                    if (!err && hub) {
                      if (hub.hub_uri.indexOf(hubUri) === -1) {
                        hub.hub_uri.push(hubUri);
                      }
                      hub.extra_data = _.assign({},
                        hub.extra_data, extraData);
                      hub.save(function(err, updatedHub) {
                          if (!err && updatedHub) {
                            updateDone(updatedHub);
                          } else {
                            updateFailed(err);
                          }
                        });
                    } else {
                      updateFailed(err);
                    }
                  });
              };

            var tryInserting = function() {
                var hub = new HubModel({
                    oauth_client_id: oauthClientId,
                    hub_uri: [hubUri],
                    extra_data: extraData
                  });

                hub.save(function(err, insertedHub) {
                    if (!err) {
                      insertDone(insertedHub);
                    } else {
                      insertFailed(err);
                    }
                  });
              };

            var updateDone = function(hub) {
                debug('Updated', oauthClientId, hubUri, hub._id);
                done('updated');
              };

            var updateFailed = function(err) {
                if (err) {
                  debug('Unable to update', oauthClientId, hubUri, err);
                }
                tryInserting();
              };

            var insertDone = function(hub) {
                debug('Saved', oauthClientId, hubUri, hub._id);
                done('inserted');
              };

            var insertFailed = function(err) {
                debug('Unable to insert', oauthClientId, hubUri, err);
                done(false);
              };

            var done = function(result) {
                if (_.isFunction(callback)) {
                  callback(result);
                }
              };

            tryUpdating();
          },

        findHub: function(oauthClientId, callback) {
            var findQuery = {oauth_client_id: oauthClientId};
            HubModel.findOne(findQuery, function(err, hub) {
                if (!err) {
                  callback(hub);
                } else {
                  debug('Error finding', oauthClientId, err);
                  callback(null);
                }
              });
          }
      };
  };
