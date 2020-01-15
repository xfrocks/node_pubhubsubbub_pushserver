'use strict'

const bullQueue = exports
const _ = require('lodash')

let callback = null
const jobs = []
bullQueue._reset = function () {
  callback = null
  jobs.length = 0
}

bullQueue._getLatestJob = () => _.last(jobs)

bullQueue._getJobs = () => [...jobs]

bullQueue.add = (name, data, opts) => {
  let done = false
  const job = {
    data,
    name,
    opts,

    error: null,
    result: null
  }

  jobs.push(job)

  if (callback === null) {
    return
  }

  callback(job, (error, result) => {
    if (done) {
      throw new Error('Job must not be done() twice')
    }

    done = true
    job.error = error
    job.result = result
  })
}

bullQueue.process = f => (callback = f)
