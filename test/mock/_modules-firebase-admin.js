'use strict'

const firebaseAdmin = exports

let latestPush = null
let pushes = []
firebaseAdmin._reset = () => {
  latestPush = null
  pushes = []
}

firebaseAdmin._errorCodes = {
  'messaging/internal-error': 'retry',
  'messaging/server-unavailable': 'retry',
  'messaging/device-message-rate-exceeded': 'noop',
  'messaging/message-rate-exceeded': 'noop',
  'messaging/authentication-error': 'invalid',
  'messaging/invalid-apns-credentials': 'invalid',
  'messaging/invalid-recipient': 'invalid',
  'messaging/invalid-registration-token': 'invalid',
  'messaging/mismatched-credential': 'invalid',
  'messaging/registration-token-not-registered': 'invalid'
}

firebaseAdmin._getLatestPush = () => latestPush

firebaseAdmin._getPushes = () => pushes

firebaseAdmin.initializeApp = (options, name) => {
  const app = {
    _getCredential: () => options.credential,
    _getName: () => name
  }

  app.messaging = () => ({
    sendToDevice: (registrationTokens, payload, options) => new Promise((resolve, reject) => {
      const response = {
        failureCount: 0,
        results: [],
        successCount: 0
      }

      if (payload.data && payload.data.error) {
        return reject(payload.data.error)
      }

      registrationTokens.forEach(registrationToken => {
        const result = {}

        if (typeof firebaseAdmin._errorCodes[registrationToken] === 'string') {
          response.failureCount++
          result.error = { code: registrationToken }
        } else {
          response.successCount++
          latestPush = { app, payload, registrationToken, options }
          pushes.push(latestPush)
        }

        response.results.push(result)
      })

      return resolve(response)
    })
  })

  return app
}

firebaseAdmin.credential = {
  cert: ({ clientEmail, privateKey, projectId }) => ({
    _getClientEmail: () => clientEmail,
    _getPrivateKey: () => privateKey,
    _getProjectId: () => projectId
  })
}
