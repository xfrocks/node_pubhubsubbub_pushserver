'use strict'

/* eslint-disable no-unused-expressions */

const helper = require('../lib/helper.js')
const chai = require('chai')
const _ = require('lodash')

chai.should()
const expect = chai.expect
describe('helper', function () {
  it('should strip html', function (done) {
    const html = '\t<b>Hello</b> <em>World</em>!\r\n'
    const result = helper.stripHtml(html)
    result.should.equal('Hello World!')
    done()
  })

  it('should prepare apn message', function (done) {
    const string229 = _.repeat('a', 229)
    helper.prepareApnMessage(string229).should.equal(string229)

    const string230 = _.repeat('a', 230)
    helper.prepareApnMessage(string230).should.equal(string230)

    const string231 = _.repeat('a', 231)
    helper.prepareApnMessage(string231).should.equal(string229 + '…')

    done()
  })

  describe('prepareApnPayload', () => {
    const f = helper.prepareApnPayload

    it('should not prepare', (done) => {
      expect(f()).to.be.null
      expect(f(null)).to.be.null
      expect(f({})).to.be.null

      expect(f({notification_html: ''})).to.be.null

      done()
    })

    it('should prepare alert (notification)', (done) => {
      f({
        notification_id: 1,
        notification_html: 'text'
      }).should.have.nested.property('aps.alert', 'text')

      done()
    })

    it('should prepare alert (conversation message)', (done) => {
      const payload = f({
        creator_username: 'user',
        message: {
          conversation_id: 1234,
          message_id: 5678,
          message: 'hello world'
        }
      })

      payload.should.have.nested.property('aps.alert', 'user: hello world')
      payload.should.have.nested.property('data.conversation_id', 1234)
      payload.should.have.nested.property('data.message_id', 5678)

      done()
    })

    it('should prepare badge', (done) => {
      f({
        notification_id: 1,
        notification_html: 'text',
        user_unread_notification_count: 123
      }).should.have.nested.property('aps.badge', 123)

      done()
    })

    it('should prepare notification type', (done) => {
      f({
        notification_id: 1,
        notification_html: 'text',
        notification_type: 'type'
      }).should.have.nested.property('data.notification_type', 'type')

      done()
    })
  })

  it('should prepare apn connection options', function (done) {
    const f = helper.prepareApnConnectionOptions
    const packageId = 'pi'
    const key = 'key'
    const keyId = 'keyId'
    const teamId = 'teamId'
    const token = {key, keyId, teamId}
    const production = true

    f(packageId, {token}).should.deep.equal({packageId, token})

    f(packageId, {token, production})
      .should.deep.equal({packageId, token, production})

    done()
  })

  it('should prepare apn connection options (legacy)', function (done) {
    const f = helper.prepareApnConnectionOptions
    const packageId = 'pi'
    const cert = 'cert'
    const key = 'key'
    const address = 'gateway.push.apple.com'
    const addressSandbox = 'gateway.sandbox.push.apple.com'

    f(packageId, {cert, key}).should.deep.equal({packageId, cert, key})
    f(packageId, {cert_data: cert, key_data: key})
      .should.deep.equal({packageId, cert, key})

    f(packageId, {cert, key, address})
      .should.deep.equal({packageId, cert, key, production: true})
    f(packageId, {cert, key, address: addressSandbox})
      .should.deep.equal({packageId, cert, key, production: false})
    f(packageId, {cert, key, gateway: address})
      .should.deep.equal({packageId, cert, key, production: true})

    done()
  })

  it('should not prepare apn connection options', function (done) {
    const f = helper.prepareApnConnectionOptions
    const packageId = 'pi'
    const key = 'key'
    const keyId = 'keyId'
    const teamId = 'teamId'
    const token = {key, keyId, teamId}
    const certData = 'cert'
    const keyData = 'key'

    expect(f()).to.be.null
    expect(f(packageId)).to.be.null
    expect(f(packageId, null)).to.be.null
    expect(f(packageId, {})).to.be.null
    expect(f(packageId, {empty: ''})).to.be.null

    expect(f(packageId, {token: {keyId, teamId}})).to.be.null
    expect(f(packageId, {token: {key, teamId}})).to.be.null
    expect(f(packageId, {token: {key, keyId}})).to.be.null

    expect(f(packageId, {cert: certData})).to.be.null
    expect(f(packageId, {key: keyData})).to.be.null

    expect(f(packageId, {token, cert: certData, key: keyData})).to.be.null

    done()
  })

  it('should prepare gcm payload', function (done) {
    const f = helper.prepareGcmPayload
    f().should.deep.equal({})

    f({
      notification_id: 1,
      notification_html: 'text'
    }).should.deep.equal({
      notification_id: 1,
      notification: 'text'
    })

    f({
      notification_id: 1,
      notification_html: 'text',
      something: 'else'
    }).should.deep.equal({
      notification_id: 1,
      notification: 'text'
    })

    f({
      key: 'value'
    }).should.deep.equal({
      key: 'value'
    })

    f({
      key: 'value',
      notification_id: 0,
      notification_html: 'irrelevant'
    }).should.deep.equal({
      key: 'value'
    })

    done()
  })

  it('should prepare gcm sender options', function (done) {
    const f = helper.prepareGcmSenderOptions
    const packageId = 'pi'
    const apiKey = 'ak'

    expect(f()).to.be.null
    expect(f(packageId)).to.be.null
    expect(f(packageId, null)).to.be.null
    expect(f(packageId, {})).to.be.null

    f(packageId, {api_key: apiKey}).should.deep.equal({packageId, apiKey})

    done()
  })

  it('should prepare wns payload', function (done) {
    const f = helper.prepareWnsPayload
    const fooBar = {foo: 'bar'}
    const fooBarJson = '{"foo":"bar"}'

    f().should.equal('{}')
    f(null).should.equal('{}')
    f({}).should.equal('{}')

    f(fooBar).should.equal(fooBarJson)
    f(fooBar, {channel_uri: 'cu'}).should.equal(fooBarJson)
    f(fooBar, {package: 'p'}).should.equal(fooBarJson)

    f(fooBar, {something: 'else'}).should.equal(JSON.stringify({
      foo: fooBar.foo,
      extra_data: {
        something: 'else'
      }
    }))

    done()
  })

  it('should prepare subscribe data', function (done) {
    const hubTopic = 'ht'
    const hubUri = 'http://domain.com/hub'
    const hubUriWithTopic = hubUri + '?hub.topic=' + hubTopic
    const oauthClientId = 'oci'
    const oauthToken = 'ot'
    const deviceType = 'dt'
    const deviceId = 'di'
    const extraData = {foo: 'bar'}

    expect(helper.prepareSubscribeData({
      hub_uri: hubUri,
      hub_topic: hubTopic,
      oauth_client_id: oauthClientId,
      oauth_token: oauthToken,

      device_type: deviceType,
      device_id: deviceId,
      extra_data: extraData
    })).to.deep.equal({
      hub_uri: hubUri,
      hub_topic: hubTopic,
      oauth_client_id: oauthClientId,
      oauth_token: oauthToken,

      device_type: deviceType,
      device_id: deviceId,
      extra_data: extraData,

      has_all_required_keys: true
    })

    expect(helper.prepareSubscribeData({})).to.deep.equal({
      hub_uri: '',
      hub_topic: '',
      oauth_client_id: '',
      oauth_token: '',

      device_type: '',
      device_id: '',
      extra_data: null,

      has_all_required_keys: true
    })

    expect(helper.prepareSubscribeData({
      hub_uri: hubUriWithTopic
    })).to.deep.equal({
      hub_uri: hubUriWithTopic,
      hub_topic: hubTopic,
      oauth_client_id: '',
      oauth_token: '',

      device_type: '',
      device_id: '',
      extra_data: null,

      has_all_required_keys: true
    })

    expect(helper.prepareSubscribeData({}, ['hub_uri']))
      .to.have.property('has_all_required_keys')
      .that.is.false

    expect(helper.prepareSubscribeData({}, ['extra_data']))
      .to.have.property('has_all_required_keys')
      .that.is.true

    done()
  })

  it('should invoke callback', function (done) {
    const args = ['0', '1']
    const later = helper.later(function (args0, args1) {
      args0.should.equal(args[0])
      args1.should.equal(args[1])
      done()
    })

    later(args[0], args[1])
  }).timeout(10)

  it('should not invoke non-function', function (done) {
    const later = helper.later(null)
    later('something', 'else')
    setTimeout(done, 10)
  })
})
