'use strict'

const admin = exports
const basicAuth = require('basic-auth')
const debug = require('debug')('pushserver:web:admin')
const _ = require('lodash')
const url = require('url')

const sections = {}
admin.setup = function (
  app,
  prefix,
  username,
  password,
  pubhubsubbub,
  db,
  pushQueue,
  _sections
) {
  sections[prefix] = []

  if (username && password) {
    const requireAuth = function (req, res, next) {
      const unauthorized = function (res) {
        res.set('WWW-Authenticate', 'Basic realm=Authorization Required')
        return res.sendStatus(401)
      }

      const user = basicAuth(req)
      if (!user || !user.name || !user.pass) {
        return unauthorized(res)
      }

      if (user.name === username &&
              user.pass === password) {
        return next()
      } else {
        return unauthorized(res)
      }
    }

    app.use(prefix, requireAuth)
  }

  if (db) {
    admin.setupProjects(app, prefix, db)
  }

  _.forEach(_sections, function (middleware, route) {
    route = route.replace(/[^a-z]/g, '')
    if (route && middleware) {
      app.use(prefix + '/' + route, middleware)
      sections[prefix].push(route)
    }
  })

  app.get(prefix, function (req, res) {
    const output = {}
    _.forEach(sections[prefix], function (section) {
      output[section] = req.protocol + '://' + req.get('host') +
             prefix + '/' + section
    })

    res.send(output)
  })

  const startTime = _.now()
  app.get(prefix + '/stats', function (req, res) {
    const promises = []
    if (pubhubsubbub) {
      promises.push(pubhubsubbub.stats())
    }
    if (db) {
      promises.push(db.stats())
    }
    if (pushQueue) {
      promises.push(pushQueue.stats())
    }

    const mergeStats = function (all) {
      const merged = {
        uptime: (_.now() - startTime) / 1000
      }

      _.forEach(all, (one) => {
        _.merge(merged, one)
      })

      res.send(merged)
    }

    Promise.all(promises).then(mergeStats).catch(mergeStats)
  })

  return admin
}

admin.setupProjects = function (app, prefix, db) {
  sections[prefix].push('projects')

  app.get(prefix + '/projects/apn', function (req, res) {
    const parsed = url.parse(req.url, true)

    return res.render('admin/projects/apn', {
      prefix: prefix,
      query: parsed.query
    })
  })

  app.post(prefix + '/projects/apn', function (req, res) {
    if (!req.body.bundle_id ||
            !req.body.token.key ||
            !req.body.token.key_id ||
            !req.body.token.team_id) {
      return res.sendStatus(400)
    }
    const bundleId = req.body.bundle_id
    const tokenKey = req.body.token.key
    const tokenKeyId = req.body.token.key_id
    const tokenTeamId = req.body.token.team_id
    const production = (!_.isUndefined(req.body.production)
      ? parseInt(req.body.production) > 0
      : true)

    db.projects.saveApn(
      bundleId,
      tokenKey,
      tokenKeyId,
      tokenTeamId,
      production,
      function (isSaved) {
        if (isSaved !== false) {
          debug('POST /projects/apn', 'Saved', bundleId)
          return res.sendStatus(202)
        } else {
          return res.sendStatus(500)
        }
      })
  })

  app.get(prefix + '/projects/fcm', function (req, res) {
    const parsed = url.parse(req.url, true)

    return res.render('admin/projects/fcm', {
      prefix: prefix,
      query: parsed.query
    })
  })

  app.post(prefix + '/projects/fcm', function (req, res) {
    if (!req.body.project_id ||
      !req.body.client_email ||
      !req.body.private_key) {
      return res.sendStatus(400)
    }
    const projectId = req.body.project_id
    const clientEmail = req.body.client_email
    const privateKey = req.body.private_key
    const clickAction = req.body.click_action || ''

    db.projects.saveFcm(
      projectId,
      clientEmail,
      privateKey,
      { clickAction },
      function (isSaved) {
        if (isSaved !== false) {
          debug('POST /projects/fcm', 'Saved', projectId)
          return res.sendStatus(202)
        } else {
          return res.sendStatus(500)
        }
      })
  })

  app.get(prefix + '/projects/gcm', function (req, res) {
    const parsed = url.parse(req.url, true)

    return res.render('admin/projects/gcm', {
      prefix: prefix,
      query: parsed.query
    })
  })

  app.post(prefix + '/projects/gcm', function (req, res) {
    if (!req.body.package_id ||
            !req.body.api_key) {
      return res.sendStatus(400)
    }
    const packageId = req.body.package_id
    const apiKey = req.body.api_key

    db.projects.saveGcm(packageId, apiKey,
      function (isSaved) {
        if (isSaved !== false) {
          debug('POST /projects/gcm', 'Saved', packageId)
          return res.sendStatus(202)
        } else {
          return res.sendStatus(500)
        }
      })
  })

  app.get(prefix + '/projects/wns', function (req, res) {
    const parsed = url.parse(req.url, true)

    return res.render('admin/projects/wns', {
      prefix: prefix,
      query: parsed.query
    })
  })

  app.post(prefix + '/projects/wns', function (req, res) {
    if (!req.body.package_id ||
            !req.body.client_id ||
            !req.body.client_secret) {
      return res.sendStatus(400)
    }
    const packageId = req.body.package_id
    const clientId = req.body.client_id
    const clientSecret = req.body.client_secret

    db.projects.saveWns(packageId, clientId, clientSecret,
      function (isSaved) {
        if (isSaved !== false) {
          debug('POST /projects/wns', 'Saved', packageId)
          return res.sendStatus(202)
        } else {
          return res.sendStatus(500)
        }
      })
  })

  app.get(prefix + '/projects/:projectType/:projectId',
    function (req, res) {
      db.projects.findProject(
        req.params.projectType,
        req.params.projectId,
        function (project) {
          if (project) {
            return res.send({
              internal_id: project._id,
              created: Math.floor(project.created.getTime() / 1000),
              last_updated: Math.floor(
                project.last_updated.getTime() / 1000)
            })
          } else {
            return res.sendStatus(404)
          }
        })
    })
}
