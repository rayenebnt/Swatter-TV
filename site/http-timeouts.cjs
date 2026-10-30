// Chargé avant le serveur de Next (node --require ./http-timeouts.cjs server.js, voir le Dockerfile).
// Node coupe toute requête qui n'est pas reçue en entier en 5 minutes (requestTimeout) : une vidéo de 500 Mo envoyée
// dans la médiathèque avec une connexion ordinaire (8 Mbit/s en envoi) prend plus longtemps. Délai porté à 30 minutes.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- fichier CommonJS chargé par node --require
const http = require('node:http')

const REQUEST_TIMEOUT_MS = 30 * 60_000
const createServer = http.createServer

http.createServer = function (...args) {
  const server = createServer.apply(this, args)
  server.requestTimeout = REQUEST_TIMEOUT_MS
  return server
}
