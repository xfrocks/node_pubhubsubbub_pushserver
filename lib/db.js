'use strict'

const helper = require('./helper')
const debug = require('debug')('pushserver:db')
const _ = require('lodash')
const mongoose = require('mongoose')

exports = module.exports = function (config) {
  let isConnecting = true
  let isConnected = false

  const mongoUri = helper.appendNodeEnv(config.db.mongoUri)
  const mongoOpts = {
    useNewUrlParser: true,
    useCreateIndex: true

    // https://github.com/Automattic/mongoose/issues/8180
    // useUnifiedTopology: true
  }
  const connection = mongoose.createConnection(mongoUri, mongoOpts, function (err) {
    if (err) {
      debug('Error connecting', mongoUri, err)
    } else {
      db.devices = require('./db/Device')(connection)
      db.hubs = require('./db/Hub')(connection)
      db.projects = require('./db/Project')(connection)

      isConnected = true
      debug('Connected')
    }

    isConnecting = false
  })

  const db = {
    isConnecting: function () {
      return isConnecting
    },

    isConnected: function () {
      return isConnected
    },

    closeConnection: function () {
      debug('Closing connection…')
      return connection.close()
        .catch((error) => debug(error))
    },

    stats: function () {
      return Promise.all([
        db.devices.stats(),
        db.hubs.stats(),
        db.projects.stats()
      ]).then(function (collections) {
        const db = {}

        _.forEach(collections, (collection) => {
          _.merge(db, collection)
        })

        return { db }
      })
    }
  }

  return db
}
