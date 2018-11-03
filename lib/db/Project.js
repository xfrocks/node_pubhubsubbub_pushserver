'use strict'

const helper = require('../helper')
const debug = require('debug')('pushserver:db:Project')
const _ = require('lodash')
const mongoose = require('mongoose')

exports = module.exports = function (connection) {
  const projectSchema = new mongoose.Schema({
    project_type: { type: String, required: true },
    project_id: { type: String, required: true },
    configuration: { type: Object, required: true },
    created: { type: Date, default: Date.now },
    last_updated: { type: Date, default: Date.now }
  })
  projectSchema.index({ project_type: 1, project_id: 1 })
  const ProjectModel = connection.model('projects', projectSchema)
  const stats = {
    inserted: 0,
    updated: 0,
    apn: 0,
    gcm: 0,
    wns: 0
  }

  return {
    _model: ProjectModel,

    stats: function () {
      return ProjectModel.countDocuments().exec().then(function (count) {
        return { projects: _.merge({ count }, stats) }
      })
    },

    saveApn: function (
      bundleId,
      tokenKey,
      tokenKeyId,
      tokenTeamId,
      production,
      callback
    ) {
      const configuration = {
        token: {
          key: tokenKey,
          keyId: tokenKeyId,
          teamId: tokenTeamId
        },
        production: production
      }

      return this.save('apn', bundleId, configuration, callback)
    },

    saveFcm: function (projectId, clientEmail, privateKey, others, callback) {
      return this.save(
        'fcm',
        projectId,
        {
          client_email: clientEmail,
          private_key: privateKey,
          click_action: others.clickAction || ''
        },
        callback
      )
    },

    saveGcm: function (packageId, apiKey, callback) {
      return this.save('gcm', packageId, { api_key: apiKey }, callback)
    },

    saveWns: function (packageId, clientId, clientSecret, callback) {
      return this.save('wns', packageId, {
        client_id: clientId,
        client_secret: clientSecret
      }, callback)
    },

    save: function (projectType, projectId, configuration, callback) {
      const tryUpdating = function () {
        ProjectModel.findOne({
          project_type: projectType,
          project_id: projectId
        }, function (err, project) {
          if (err || !project) {
            return updateFailed(err)
          }

          project.configuration = configuration
          project.last_updated = Date.now()
          project.save(function (err, updatedProject) {
            if (!err && updatedProject) {
              updateDone(updatedProject)
            } else {
              updateFailed(err)
            }
          })
        })
      }

      const tryInserting = function () {
        const project = new ProjectModel({
          project_type: projectType,
          project_id: projectId,
          configuration: configuration
        })

        project.save(function (err, insertedProject) {
          if (!err) {
            insertDone(insertedProject)
          } else {
            insertFailed(err)
          }
        })
      }

      const updateDone = function (project) {
        stats.updated++
        if (_.has(stats, projectType)) {
          stats[projectType]++
        }

        debug('Updated', projectType, projectId, project._id)
        done('updated')
      }

      const updateFailed = function (err) {
        if (err) {
          debug('Unable to update', projectType, projectId, err)
        }
        tryInserting()
      }

      const insertDone = function (project) {
        stats.inserted++
        if (_.has(stats, projectType)) {
          stats[projectType]++
        }

        debug('Saved', projectType, projectId, project._id)
        done('inserted')
      }

      const insertFailed = function (err) {
        debug('Unable to insert', projectType, projectId, err)
        done(false)
      }

      const done = helper.later(callback)

      tryUpdating()
    },

    findProject: function (projectType, projectId, callback) {
      const done = helper.later(callback)

      ProjectModel.findOne({
        project_type: projectType,
        project_id: projectId
      }, function (err, project) {
        if (!err && project) {
          done(project)
        } else {
          debug('Error finding one', projectType, projectId, err)
          done(null)
        }
      })
    },

    findConfig: function (projectType, projectId, callback) {
      const done = helper.later(callback)

      this.findProject(projectType, projectId, function (project) {
        if (project) {
          done(project.configuration)
        } else {
          done(null)
        }
      })
    }
  }
}
