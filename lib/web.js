'use strict'

const path = require('path')

const web = exports
const config = require('./config')
const debug = require('debug')('pushserver:web')

let app = null
let appDb = null
let appPushQueue = null
web.app = function () {
  if (app === null) {
    const express = require('express')
    app = express()
    app.disable('x-powered-by')

    const bodyParser = require('body-parser')
    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json())

    app.set('view engine', 'pug')
    app.use('/bs', express.static(path.join(__dirname, '/../node_modules/bootstrap/dist')))
  }

  return app
}

web.setup = function (app, db, pushQueue, adminSections) {
  const pubhubsubbub = require('./web/pubhubsubbub')
    .setup(app, '', db, pushQueue)

  if (config.web.adminPrefix &&
        config.web.username &&
        config.web.password) {
    require('./web/admin').setup(
      app,
      config.web.adminPrefix,
      config.web.username,
      config.web.password,
      pubhubsubbub,
      db,
      pushQueue,
      adminSections
    )
  }

  return web
}

web.start = function (db, pushQueue) {
  const adminSections = {}

  if (!db) {
    debug('Loading db…')
    db = require('./db')(config)
    appDb = db
  }

  if (!pushQueue) {
    debug('Loading push queue…')

    pushQueue = require('./pushQueue')
    const kue = require('kue')
    const pushKue = pushQueue.createQueue(kue)
    if (config.pushQueue.web) {
      adminSections.queue = kue.app
    }

    pushQueue.setup(pushKue, require('./pusher').setupDefault(), db)
    appPushQueue = pushQueue
  }

  debug('Starting…')
  const app = web.app()
  web.setup(app, db, pushQueue, adminSections)

  const server = app.listen(config.web.port)
  const addr = server.address()
  debug('Listening on port ' + addr.port + '…')

  return server
}

web._reset = function (callback) {
  app = null

  let f = function () {
    if (typeof callback === 'function') {
      debug('Calling callback at the end of web._reset()…')
      callback()
    }
  }
  if (appDb !== null) {
    f = (function (next) {
      return function () {
        debug('Closing db connection…')
        appDb.closeConnection().then(next)
        appDb = null
      }
    })(f)
  }

  if (appPushQueue !== null) {
    f = (function (next) {
      return function () {
        debug('Resetting push queue…')
        appPushQueue._reset(next)
      }
    })(f)
  }

  f()
}
