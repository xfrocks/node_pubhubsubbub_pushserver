'use strict'

const helper = require('../helper')
const debug = require('debug')('pushserver:db:Hub')
const _ = require('lodash')
const mongoose = require('mongoose')

exports = module.exports = function (connection) {
  const hubSchema = new mongoose.Schema({
    oauth_client_id: { type: String,
      required: true,
      index: true,
      unique: true },
    hub_uri: { type: [String], default: [] },
    extra_data: { type: Object, default: {} }
  })
  const HubModel = connection.model('hubs', hubSchema)
  const stats = {
    inserted: 0,
    updated: 0
  }

  return {
    _model: HubModel,

    stats: function () {
      return HubModel.countDocuments().exec().then(function (count) {
        return { hubs: _.merge({ count }, stats) }
      })
    },

    save: function (oauthClientId, hubUri, extraData, callback) {
      const tryUpdating = function () {
        HubModel.findOne({
          oauth_client_id: oauthClientId
        }, function (err, hub) {
          if (err || !hub) {
            return updateFailed(err)
          }

          let changed = false

          if (hub.hub_uri.indexOf(hubUri) === -1) {
            hub.hub_uri = hub.hub_uri.concat([hubUri])
            changed = true
          }

          const newExtraData = _.merge({},
            hub.extra_data, extraData)
          if (!_.isEqual(hub.extra_data, newExtraData)) {
            hub.extra_data = newExtraData
            changed = true
          }

          if (!changed) {
            return nopDone()
          }

          hub.save(function (err, updatedHub) {
            if (!err && updatedHub) {
              updateDone(updatedHub)
            } else {
              updateFailed(err)
            }
          })
        })
      }

      const tryInserting = function () {
        const hub = new HubModel({
          oauth_client_id: oauthClientId,
          hub_uri: [hubUri],
          extra_data: extraData
        })

        hub.save(function (err, insertedHub) {
          if (!err) {
            insertDone(insertedHub)
          } else {
            insertFailed(err)
          }
        })
      }

      const nopDone = function () {
        done('nop')
      }

      const updateDone = function (hub) {
        stats.updated++
        debug('Updated', oauthClientId, hubUri, hub._id)
        done('updated')
      }

      const updateFailed = function (err) {
        if (err) {
          debug('Unable to update', oauthClientId, hubUri, err)
        }
        tryInserting()
      }

      const insertDone = function (hub) {
        stats.inserted++
        debug('Saved', oauthClientId, hubUri, hub._id)
        done('inserted')
      }

      const insertFailed = function (err) {
        debug('Unable to insert', oauthClientId, hubUri, err)
        done(false)
      }

      const done = helper.later(callback)

      tryUpdating()
    },

    findHub: function (oauthClientId, callback) {
      const findQuery = { oauth_client_id: oauthClientId }
      const done = helper.later(callback)

      HubModel.findOne(findQuery, function (err, hub) {
        if (!err) {
          done(hub)
        } else {
          debug('Error finding', oauthClientId, err)
          done(null)
        }
      })
    }
  }
}
