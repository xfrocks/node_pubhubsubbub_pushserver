'use strict'

/* eslint-disable no-unused-expressions */

const config = require('../lib/config')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect

let db = null
const originalProcessEnv = _.cloneDeep(process.env)
const projectType = 'dt'
const projectIdBase = 'di' + _.now()
const configuration = { foo: 'bar' }

describe('db/Project', function () {
  before(function (done) {
    // eslint-disable-next-line no-invalid-this
    this.timeout(20000)

    process.env = _.cloneDeep(originalProcessEnv)
    config._reload()
    db = require('../lib/db')(config)

    const waitForDb = function () {
      if (!db.isConnected()) {
        return setTimeout(waitForDb, 100)
      }

      done()
    }

    waitForDb()
  })

  after(function (done) {
    db.projects._model.collection.drop()
      .then(() => db.closeConnection())
      .then(done)
  })

  it('should save project', function (done) {
    const projectId = projectIdBase + '-save'

    const step1 = function () {
      db.projects.save(projectType, projectId, configuration,
        function (isSaved) {
          isSaved.should.not.be.false
          step2()
        })
    }

    const step2 = function () {
      db.projects._model.find({
        project_type: projectType,
        project_id: projectId
      }, function (err, projects) {
        expect(err).to.be.null
        projects.should.be.a('array')
        projects.length.should.equal(1)
        projects[0].configuration.should.deep.equal(configuration)

        done()
      })
    }

    step1()
  })

  it('should save apn', function (done) {
    const bundleId = projectIdBase + '-bi'
    const tokenKey = 'tk'
    const tokenKeyId = 'tki'
    const tokenTeamId = 'tti'
    const production = true

    const step1 = function () {
      db.projects.saveApn(
        bundleId,
        tokenKey,
        tokenKeyId,
        tokenTeamId,
        production,
        function (isSaved) {
          isSaved.should.not.be.false
          step2()
        }
      )
    }

    const step2 = function () {
      db.projects._model.find({
        project_type: 'apn',
        project_id: bundleId
      }, function (err, projects) {
        expect(err).to.be.null
        projects.should.be.a('array')
        projects.length.should.equal(1)

        const project = projects[0]
        project.configuration.should.be.a('object')
        project.configuration.token.should.be.a('object')
        project.configuration.token.key.should.equal(tokenKey)
        project.configuration.token.keyId.should.equal(tokenKeyId)
        project.configuration.token.teamId.should.equal(tokenTeamId)
        project.configuration.production.should.equal(production)

        done()
      })
    }

    step1()
  })

  it('should save fcm', function (done) {
    const projectId = projectIdBase + '-fcm-pi'
    const clientEmail = 'email@client.com'
    const privateKey = 'pi'

    const step1 = function () {
      db.projects.saveFcm(projectId, clientEmail, privateKey, function (isSaved) {
        isSaved.should.not.be.false
        step2()
      })
    }

    const step2 = function () {
      db.projects._model.find({
        project_type: 'fcm',
        project_id: projectId
      }, function (err, projects) {
        expect(err).to.be.null
        projects.should.be.a('array')
        projects.length.should.equal(1)

        const project = projects[0]
        project.configuration.should.be.a('object')
        project.configuration.client_email.should.equal(clientEmail)
        project.configuration.private_key.should.equal(privateKey)

        done()
      })
    }

    step1()
  })

  it('should save gcm', function (done) {
    const packageId = projectIdBase + '-gcm-pi'
    const apiKey = 'ak'

    const step1 = function () {
      db.projects.saveGcm(packageId, apiKey, function (isSaved) {
        isSaved.should.not.be.false
        step2()
      })
    }

    const step2 = function () {
      db.projects._model.find({
        project_type: 'gcm',
        project_id: packageId
      }, function (err, projects) {
        expect(err).to.be.null
        projects.should.be.a('array')
        projects.length.should.equal(1)

        const project = projects[0]
        project.configuration.should.be.a('object')
        project.configuration.api_key.should.equal(apiKey)

        done()
      })
    }

    step1()
  })

  it('should save wns', function (done) {
    const packageId = projectIdBase + '-wns-pi'
    const clientId = 'ci'
    const clientSecret = 'cs'

    const step1 = function () {
      db.projects.saveWns(packageId, clientId, clientSecret,
        function (isSaved) {
          isSaved.should.not.be.false
          step2()
        })
    }

    const step2 = function () {
      db.projects._model.find({
        project_type: 'wns',
        project_id: packageId
      }, function (err, projects) {
        expect(err).to.be.null
        projects.should.be.a('array')
        projects.length.should.equal(1)

        const project = projects[0]
        project.configuration.should.be.a('object')
        project.configuration.client_id.should.equal(clientId)
        project.configuration.client_secret.should.equal(clientSecret)

        done()
      })
    }

    step1()
  })

  it('should update project', function (done) {
    const projectId = projectIdBase + '-update'
    const configuration2 = { bar: 'foo' }
    let theProject = null

    const init = function () {
      db.projects._model.create({
        project_type: projectType,
        project_id: projectId,
        configuration: configuration
      }, function (err, project) {
        expect(err).to.be.null
        project.should.not.be.null
        project.configuration.should.deep.equal(configuration)
        theProject = project
        step1()
      })
    }

    const step1 = function () {
      db.projects.save(projectType, projectId, configuration2,
        function (isSaved) {
          isSaved.should.not.be.false
          step2()
        })
    }

    const step2 = function () {
      db.projects._model.findById(theProject._id,
        function (err, project) {
          expect(err).to.be.null
          project.configuration.should.deep.equal(configuration2)
          project.created.getTime()
            .should.equal(theProject.created.getTime())
          project.last_updated.getTime()
            .should.above(theProject.last_updated.getTime())

          done()
        })
    }

    init()
  })

  it('should return project', function (done) {
    const projectId = projectIdBase + '-return'
    const now = Date.now()

    const init = function () {
      db.projects._model.create({
        project_type: projectType,
        project_id: projectId,
        configuration: configuration
      }, function () {
        step1()
      })
    }

    const step1 = function () {
      db.projects.findProject(projectType, projectId, function (project) {
        project.should.be.a('object')
        project.project_type.should.equal(projectType)
        project.project_id.should.equal(projectId)
        project.configuration.should.deep.equal(configuration)
        project.created.getTime().should.be.at.least(now)
        project.last_updated.getTime().should.be.at.least(now)

        done()
      })
    }

    init()
  })

  it('should return project configuration', function (done) {
    const projectId = projectIdBase + '-return-config'

    const init = function () {
      db.projects._model.create({
        project_type: projectType,
        project_id: projectId,
        configuration: configuration
      }, function () {
        step1()
      })
    }

    const step1 = function () {
      db.projects.findConfig(projectType, projectId,
        function (projectConfig) {
          projectConfig.should.be.a('object')
          projectConfig.should.deep.equal(configuration)

          done()
        })
    }

    init()
  })
})
