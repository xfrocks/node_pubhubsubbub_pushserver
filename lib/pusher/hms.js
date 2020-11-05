'use strict'

const pusher = exports
const helper = require('../helper')
const axios = require('axios').default
const debug = require('debug')('pushserver:pusher:hms')
const { stringify } = require('querystring')
const _ = require('lodash')

let stats = {}
pusher.setup = function () {
  stats = {}

  return pusher
}

pusher.stats = function () {
  return new Promise((resolve) => {
    resolve({ hms: _.cloneDeep(stats) })
  })
}

pusher.send = function (appId, appSecret, token, message, callback) {
  if (_.isString(token)) {
    token = [token]
  }

  const done = helper.later(callback)

  const errors = {}
  const result = { sent: 0, failed: 0, retries: [], invalids: [] }

  axios.post(
    'https://oauth-login.cloud.huawei.com/oauth2/v3/token',
    stringify({
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: appSecret
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  ).then(
    (response) => {
      const { data } = response
      if (!_.isObjectLike(data)) {
        debug('Invalid access token response', response)
        result.failed = token.length
        return
      }

      const {
        access_token: accessToken,
        expires_in: expiresIn
      } = data
      if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
        debug('Invalid access token data', data)
        result.failed = token.length
        return
      }

      const payload = {
        message: {
          ...message,
          token
        }
      }
      debug('Sending payload...', JSON.stringify(payload))

      return axios.post(
        `https://push-api.cloud.huawei.com/v1/${appId}/messages:send`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      ).then(
        (response) => {
          if (response.status === 200) {
            result.sent = token.length
            debug('Sent message!', response.status, response.data)
          } else {
            result.failed = token.length
            debug('Unable to send message', response.status, response.data)
          }
        },
        (error) => {
          result.failed = token.length
          debug('Send message error', error)
        }
      )
    }, (error) => {
      result.failed = token.length
      debug('Get accesss token error', error)
    }
  )
    .finally(() => {
      doStats(appId, result)

      if (result.failed === 0) {
        done(undefined, result)
      } else {
        done(errors, result)
      }
    })
}

const doStats = function (appId, result) {
  if (!_.has(stats, appId)) {
    stats[appId] = {
      batch: 0,
      sent: 0,
      failed: 0,
      invalid: 0
    }
  }

  stats[appId].batch++
  stats[appId].sent += result.sent
  stats[appId].failed += result.failed
  stats[appId].invalid += result.invalids.length
}
