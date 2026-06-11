const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });

const exceptionQueue = new Queue('DeliveryExceptions', { connection });

async function enqueueExceptionAlert(data) {
  // Push a high priority job to the exception queue
  await exceptionQueue.add('exceptionAlert', data, { priority: 1, attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
}

let exceptionWorker;

function startExceptionWorker() {
  exceptionWorker = new Worker('DeliveryExceptions', async (job) => {
    // In a real scenario, this might push a Slack alert or SMS to admins
    console.warn(`[ExceptionQueue] Processed exception alert for Order ${job.data.orderId}: ${job.data.issueReason}`);
  }, { connection });

  exceptionWorker.on('failed', (job, err) => {
    console.error(`[ExceptionQueue] Job ${job.id} failed:`, err.message);
  });
}

async function shutdownExceptionQueue() {
  if (exceptionWorker) await exceptionWorker.close();
  await exceptionQueue.close();
}

module.exports = {
  enqueueExceptionAlert,
  startExceptionWorker,
  shutdownExceptionQueue
};
