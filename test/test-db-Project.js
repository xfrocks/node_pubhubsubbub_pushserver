'use strict';

const config = require('../lib/config');
const chai = require('chai');
const _ = require('lodash');

chai.should();

let db = null;
const originalProcessEnv = _.cloneDeep(process.env);
const projectType = 'dt';
const projectId = 'di';
const configuration = {foo: 'bar'};

describe('db/Project', function() {
    before(function(done) {
        // eslint-disable-next-line no-invalid-this
        this.timeout(20000);

        process.env = _.cloneDeep(originalProcessEnv);
        config._reload();
        db = require('../lib/db')(config);

        const waitForDb = function() {
            if (!db.isConnected()) {
              return setTimeout(waitForDb, 100);
            }

            done();
          };

        waitForDb();
      });

    after(function(done) {
        db.closeConnection().then(done);
      });

    beforeEach(function(done) {
        db.projects._model.collection.drop().then(function() {
            done();
          }).catch(function() {
            done();
          });
      });

    it('should save project', function(done) {
        const step1 = function() {
            db.projects.save(projectType, projectId, configuration,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.projects._model.find({
                project_type: projectType,
                project_id: projectId,
              }, function(err, projects) {
                projects.should.be.a('array');
                projects.length.should.equal(1);
                projects[0].configuration.should.deep.equal(configuration);

                done();
              });
          };

        step1();
      });

    it('should save apn', function(done) {
        const bundleId = 'bi';
        const tokenKey = 'tk';
        const tokenKeyId = 'tki';
        const tokenTeamId = 'tti';
        const production = true;

        const step1 = function() {
            db.projects.saveApn(
              bundleId,
              tokenKey,
              tokenKeyId,
              tokenTeamId,
              production,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              }
            );
          };

        const step2 = function() {
            db.projects._model.find({
                project_type: 'apn',
                project_id: bundleId,
              }, function(err, projects) {
                projects.should.be.a('array');
                projects.length.should.equal(1);

                const project = projects[0];
                project.configuration.should.be.a('object');
                project.configuration.token.should.be.a('object');
                project.configuration.token.key.should.equal(tokenKey);
                project.configuration.token.keyId.should.equal(tokenKeyId);
                project.configuration.token.teamId.should.equal(tokenTeamId);
                project.configuration.production.should.equal(production);

                done();
              });
          };

        step1();
      });

    it('should save gcm', function(done) {
        const packageId = 'pi';
        const apiKey = 'ak';

        const step1 = function() {
            db.projects.saveGcm(packageId, apiKey, function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.projects._model.find({
                project_type: 'gcm',
                project_id: packageId,
              }, function(err, projects) {
                projects.should.be.a('array');
                projects.length.should.equal(1);

                const project = projects[0];
                project.configuration.should.be.a('object');
                project.configuration.api_key.should.equal(apiKey);

                done();
              });
          };

        step1();
      });

    it('should save wns', function(done) {
        const packageId = 'pi';
        const clientId = 'ci';
        const clientSecret = 'cs';

        const step1 = function() {
            db.projects.saveWns(packageId, clientId, clientSecret,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.projects._model.find({
                project_type: 'wns',
                project_id: packageId,
              }, function(err, projects) {
                projects.should.be.a('array');
                projects.length.should.equal(1);

                const project = projects[0];
                project.configuration.should.be.a('object');
                project.configuration.client_id.should.equal(clientId);
                project.configuration.client_secret.should.equal(clientSecret);

                done();
              });
          };

        step1();
      });

    it('should update project', function(done) {
        const configuration2 = {bar: 'foo'};
        let theProject = null;

        const init = function() {
            db.projects._model.create({
                project_type: projectType,
                project_id: projectId,
                configuration: configuration,
              }, function(err, project) {
                project.should.not.be.null;
                project.configuration.should.deep.equal(configuration);
                theProject = project;
                step1();
              });
          };

        const step1 = function() {
            db.projects.save(projectType, projectId, configuration2,
              function(isSaved) {
                isSaved.should.not.be.false;
                step2();
              });
          };

        const step2 = function() {
            db.projects._model.findById(theProject._id,
              function(err, project) {
                project.configuration.should.deep.equal(configuration2);
                project.created.getTime().
                  should.equal(theProject.created.getTime());
                project.last_updated.getTime().
                  should.above(theProject.last_updated.getTime());

                done();
              });
          };

        init();
      });

    it('should return project', function(done) {
        const now = Date.now();

        const init = function() {
            db.projects._model.create({
                project_type: projectType,
                project_id: projectId,
                configuration: configuration,
              }, function() {
                step1();
              });
          };

        const step1 = function() {
            db.projects.findProject(projectType, projectId, function(project) {
                project.should.be.a('object');
                project.project_type.should.equal(projectType);
                project.project_id.should.equal(projectId);
                project.configuration.should.deep.equal(configuration);
                project.created.getTime().should.be.at.least(now);
                project.last_updated.getTime().should.be.at.least(now);

                done();
              });
          };

        init();
      });

    it('should return project configuration', function(done) {
        const init = function() {
            db.projects._model.create({
                project_type: projectType,
                project_id: projectId,
                configuration: configuration,
              }, function() {
                step1();
              });
          };

        const step1 = function() {
            db.projects.findConfig(projectType, projectId,
              function(projectConfig) {
                projectConfig.should.be.a('object');
                projectConfig.should.deep.equal(configuration);

                done();
              });
          };

        init();
      });
  });
