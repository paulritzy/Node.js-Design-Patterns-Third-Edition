import { createServer } from 'http'
import staticHandler from 'serve-handler'
import ws from 'ws'
import Redis from 'ioredis'

const redisClient = new Redis()
const redisClientXRead = new Redis()

// serve static files
const server = createServer((req, res) => {
  return staticHandler(req, res, { public: 'www' })
})

const wss = new ws.Server({ server })
wss.on('connection', async client => {
  console.log('Client connected')

  client.on('message', msg => {
    console.log(`Message: ${msg}`)
    redisClient.xadd('chat_stream', '*', 'message', msg)
  })

  // Load message history
  const logs = await redisClient.xrange('chat_stream', '-', '+')
  for (const [, [, message]] of logs) {
    client.send(message)
  }
})

function broadcast (msg) {
  for (const client of wss.clients) {
    if (client.readyState === ws.OPEN) {
      client.send(msg)
    }
  }
}

let lastMessageId = '$'
async function processStreamMessages () {
  while (true) {
    const data = await redisClientXRead.xread('BLOCK', '0', 'STREAMS', 'chat_stream', lastMessageId)
    for (const [, logs] of data) {
      for (const [messageId, [, message]] of logs) {
        console.log(`Message from stream: ${message}`)
        broadcast(message)
        lastMessageId = messageId
      }
    }
  }
}
processStreamMessages().catch(err => console.error(err))

server.listen(process.argv[2] || 8080)