'use strict'

const promClient = exports
const config = require('../config')
const helper = require('../helper')
const { register: globalRegister, Gauge, Summary } = require('prom-client')

function makeGuages (statPrefix, registers) {
  return {
    completed: new Gauge({
      registers,
      name: `${statPrefix}completed`,
      help: 'Number of completed messages',
      labelNames: ['queue', 'prefix']
    }),
    completeSummary: new Summary({
      registers,
      name: `${statPrefix}complete_duration`,
      help: 'Time to complete jobs',
      labelNames: ['queue', 'prefix'],
      maxAgeSeconds: 300,
      ageBuckets: 13
    }),
    active: new Gauge({
      registers,
      name: `${statPrefix}active`,
      help: 'Number of active messages',
      labelNames: ['queue', 'prefix']
    }),
    delayed: new Gauge({
      registers,
      name: `${statPrefix}delayed`,
      help: 'Number of delayed messages',
      labelNames: ['queue', 'prefix']
    }),
    failed: new Gauge({
      registers,
      name: `${statPrefix}failed`,
      help: 'Number of failed messages',
      labelNames: ['queue', 'prefix']
    }),
    waiting: new Gauge({
      registers,
      name: `${statPrefix}waiting`,
      help: 'Number of waiting messages',
      labelNames: ['queue', 'prefix']
    })
  }
}

async function getStats (prefix, name, queue, gauges) {
  const { completed, active, delayed, failed, waiting } = await queue.getJobCounts()

  gauges.completed.set({ prefix, queue: name }, completed)
  gauges.active.set({ prefix, queue: name }, active)
  gauges.delayed.set({ prefix, queue: name }, delayed)
  gauges.failed.set({ prefix, queue: name }, failed)
  gauges.waiting.set({ prefix, queue: name }, waiting)
}

promClient.setup = (app, queue) => {
  globalRegister.clear()

  const guages = makeGuages('bull_queue_', [globalRegister])
  const name = queue.name
  const prefix = helper.appendNodeEnv(config.pushQueue.prefix)

  app.get('/metrics', async function (_, res) {
    await getStats(prefix, name, queue, guages)
    res.contentType(globalRegister.contentType)
    res.send(await globalRegister.metrics())
  })
}
