'use strict'

/* eslint-disable no-unused-expressions */

const web = require('../lib/web')
const chai = require('chai')
const http = require('http')
const _ = require('lodash')

chai.should()
chai.use(require('chai-http'))
const expect = chai.expect
const db = require('./mock/db')
const admin = require('../lib/web/admin')

let server = null
let webApp = null

describe('web/admin', function () {
  // eslint-disable-next-line no-invalid-this
  this.timeout(20000)

  before(function (done) {
    web._reset()
    server = http.createServer(web.app()).listen(0)
    webApp = chai.request(server).keepOpen()
    admin.setup(web.app(), '/admin', null, null, null, db)
    done()
  })

  beforeEach(function (done) {
    db.projects._reset()
    done()
  })

  after(function (done) {
    server.close()
    done()
  })

  it('should return sections', function (done) {
    webApp
      .get('/admin')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        res.should.not.have.header('x-powered-by')
        res.body.should.have.all.keys('projects')

        done()
      })
  })

  it('should show apn form', function (done) {
    webApp
      .get('/admin/projects/apn')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        done()
      })
  })

  it('should save apn project', function (done) {
    const test = function (extraData, assertCallback) {
      const bundleId = 'bi'
      const tokenKey = 'tk'
      const tokenKeyId = 'tki'
      const tokenTeamId = 'tti'

      const step1 = function () {
        const data = _.merge({
          bundle_id: bundleId,
          token: {
            key: tokenKey,
            key_id: tokenKeyId,
            team_id: tokenTeamId
          }
        }, extraData)
        webApp
          .post('/admin/projects/apn')
          .send(data)
          .end(function (err, res) {
            expect(err).to.be.null
            res.should.have.status(202)
            step2()
          })
      }

      const step2 = function () {
        db.projects.findConfig('apn', bundleId, function (projectConfig) {
          projectConfig.should.not.be.null
          projectConfig.token.should.be.a('object')
          projectConfig.token.key.should.equal(tokenKey)
          projectConfig.token.keyId.should.equal(tokenKeyId)
          projectConfig.token.teamId.should.equal(tokenTeamId)

          assertCallback(projectConfig)
        })
      }

      step1()
    }

    const test1 = function () {
      test({ production: 1 }, function (projectConfig) {
        projectConfig.production.should.be.true

        test2()
      })
    }

    const test2 = function () {
      test({ production: 0 }, function (projectConfig) {
        projectConfig.production.should.be.false

        test3()
      })
    }

    const test3 = function () {
      test({}, function (projectConfig) {
        projectConfig.production.should.be.true

        done()
      })
    }

    test1()
  })

  it('should not save apn project', function (done) {
    const bundleId = 'bi'
    const tokenKey = 'tk'
    const tokenKeyId = 'tki'
    const tokenTeamId = 'tti'

    const test = function (data, endCallback) {
      webApp
        .post('/admin/projects/apn')
        .send(data)
        .end(endCallback)
    }

    const test1 = function () {
      test({
        token: {
          key: tokenKey,
          key_id: tokenKeyId,
          team_id: tokenTeamId
        }
      }, function (err, res) {
        expect(err).to.be.null
        res.should.have.status(400)
        test2()
      })
    }

    const test2 = function () {
      test({
        bundle_id: bundleId,
        token: {
          key_id: tokenKeyId,
          team_id: tokenTeamId
        }
      }, function (err, res) {
        expect(err).to.be.null
        res.should.have.status(400)
        test3()
      })
    }

    const test3 = function () {
      test({
        bundle_id: bundleId,
        token: {
          key: tokenKey,
          team_id: tokenTeamId
        }
      }, function (err, res) {
        expect(err).to.be.null
        res.should.have.status(400)
        test4()
      })
    }

    const test4 = function () {
      test({
        bundle_id: bundleId,
        token: {
          key: tokenKey,
          key_id: tokenKeyId
        }
      }, function (err, res) {
        expect(err).to.be.null
        res.should.have.status(400)
        test5()
      })
    }

    const test5 = function () {
      test({
        bundle_id: 'error',
        token: {
          key: tokenKey,
          key_id: tokenKeyId,
          team_id: tokenTeamId
        }
      }, function (err, res) {
        expect(err).to.be.null
        res.should.have.status(500)
        done()
      })
    }

    test1()
  })

  it('should show gcm form', function (done) {
    webApp
      .get('/admin/projects/gcm')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        done()
      })
  })

  it('should save gcm project', function (done) {
    const packageId = 'pi'
    const apiKey = 'ak'

    const step1 = function () {
      webApp
        .post('/admin/projects/gcm')
        .send({
          package_id: packageId,
          api_key: apiKey
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          step2()
        })
    }

    const step2 = function () {
      db.projects.findConfig('gcm', packageId, function (projectConfig) {
        projectConfig.should.not.be.null
        projectConfig.api_key.should.equal(apiKey)

        done()
      })
    }

    step1()
  })

  it('should not save gcm project', function (done) {
    const packageId = 'pi'
    const apiKey = 'ak'

    const test1 = function () {
      webApp
        .post('/admin/projects/gcm')
        .send({
          api_key: apiKey
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)
          test2()
        })
    }

    const test2 = function () {
      webApp
        .post('/admin/projects/gcm')
        .send({
          package_id: packageId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)
          test3()
        })
    }

    const test3 = function () {
      webApp
        .post('/admin/projects/gcm')
        .send({
          package_id: 'error',
          api_key: apiKey
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(500)
          done()
        })
    }

    test1()
  })

  it('should show wns form', function (done) {
    webApp
      .get('/admin/projects/wns')
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(200)
        done()
      })
  })

  it('should save wns project', function (done) {
    const packageId = 'pi'
    const clientId = 'ci'
    const clientSecret = 'cs'

    const step1 = function () {
      webApp
        .post('/admin/projects/wns')
        .send({
          package_id: packageId,
          client_id: clientId,
          client_secret: clientSecret
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(202)
          step2()
        })
    }

    const step2 = function () {
      db.projects.findConfig('wns', packageId, function (projectConfig) {
        projectConfig.should.not.be.null
        projectConfig.client_id.should.equal(clientId)
        projectConfig.client_secret.should.equal(clientSecret)

        done()
      })
    }

    step1()
  })

  it('should not save wns project', function (done) {
    const packageId = 'pi'
    const clientId = 'ci'
    const clientSecret = 'cs'

    const test1 = function () {
      webApp
        .post('/admin/projects/wns')
        .send({
          client_id: clientId,
          client_secret: clientSecret
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)
          test2()
        })
    }

    const test2 = function () {
      webApp
        .post('/admin/projects/wns')
        .send({
          package_id: packageId,
          client_secret: clientSecret
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)
          test3()
        })
    }

    const test3 = function () {
      webApp
        .post('/admin/projects/wns')
        .send({
          package_id: packageId,
          client_id: clientId
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(400)
          test4()
        })
    }

    const test4 = function () {
      webApp
        .post('/admin/projects/wns')
        .send({
          package_id: 'error',
          client_id: clientId,
          client_secret: clientSecret
        })
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(500)
          done()
        })
    }

    test1()
  })

  it('should respond with project info', function (done) {
    const projectType = 'pt'
    const projectId = 'pi'
    const configuration = { foo: 'bar' }

    const init = function () {
      db.projects.save(projectType, projectId, configuration,
        function (isSaved) {
          isSaved.should.not.be.false
          test()
        })
    }

    const test = function () {
      webApp
        .get('/admin/projects/' + projectType + '/' + projectId)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.body.should
            .have.all.keys('internal_id', 'created', 'last_updated')

          done()
        })
    }

    init()
  })

  it('should not respond for unknown project', function (done) {
    const projectType = 'pt-unknown'
    const projectId = 'pi-unknown'

    webApp
      .get('/admin/projects/' + projectType + '/' + projectId)
      .end(function (err, res) {
        expect(err).to.be.null
        res.should.have.status(404)
        done()
      })
  })

  it('should require auth', function (done) {
    const adminPrefix = '/admin-auth'
    const username = 'username'
    const password = 'password'
    admin.setup(web.app(), adminPrefix, username, password)

    const test1 = function () {
      webApp
        .get(adminPrefix)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(401)
          test2()
        })
    }

    const test2 = function () {
      webApp
        .get(adminPrefix)
        .auth(username, password + 'z')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(401)
          test3()
        })
    }

    const test3 = function () {
      webApp
        .get(adminPrefix)
        .auth(username, password)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          done()
        })
    }

    test1()
  })

  it('should setup sections', function (done) {
    const adminPrefix = '/admin-sections'
    const sections = {
      'one': function (req, res, next) {
        res.send({ section: 1 })
        next()
      },
      'two2': function (req, res, next) {
        res.send({ section: 2 })
        next()
      },
      'three_': function (req, res, next) {
        res.send({ section: 3 })
        next()
      },
      '!@#$': function (req, res, next) {
        res.send({ section: 'invalid' })
        next()
      },
      'five': null
    }

    admin.setup(web.app(),
      adminPrefix, null, null,
      null, null, null, sections
    )

    const test0 = function () {
      webApp
        .get(adminPrefix)
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.body.should.have.all.keys('one', 'two', 'three')
          test1()
        })
    }

    const test1 = function () {
      webApp
        .get(adminPrefix + '/one')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.body.should.deep.equal({ section: 1 })
          test2()
        })
    }

    const test2 = function () {
      webApp
        .get(adminPrefix + '/two')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.body.should.deep.equal({ section: 2 })
          test3()
        })
    }

    const test3 = function () {
      webApp
        .get(adminPrefix + '/three')
        .end(function (err, res) {
          expect(err).to.be.null
          res.should.have.status(200)
          res.body.should.deep.equal({ section: 3 })
          done()
        })
    }

    test0()
  })
})
