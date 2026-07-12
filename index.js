const express = require('express')
const cors = require('cors')
const https = require('https')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN
const FRONTEND_URL = process.env.FRONTEND_URL

app.post('/criar-pagamento', async (req, res) => {
  try {
    const { item, preco, tipo, gems, pkg_id, item_id } = req.body
    const successUrl = tipo === 'gemas' ? FRONTEND_URL + '?gems=' + gems + '&pkg=' + pkg_id : FRONTEND_URL + '?item=' + item_id + '&paid=1'
    const body = JSON.stringify({ items: [{ title: item, quantity: 1, unit_price: preco, currency_id: 'BRL' }], back_urls: { success: successUrl, failure: FRONTEND_URL + '?erro=pagamento', pending: FRONTEND_URL + '?pendente=1' }, auto_return: 'approved' })
    const options = { hostname: 'api.mercadopago.com', path: '/checkout/preferences', method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + MP_ACCESS_TOKEN } }
    const mpReq = https.request(options, (mpRes) => { let data = ''; mpRes.on('data', chunk => data += chunk); mpRes.on('end', () => { const result = JSON.parse(data); res.json({ link: result.sandbox_init_point || result.init_point }) }) })
    mpReq.on('error', e => res.status(500).json({ erro: e.message }))
    mpReq.write(body)
    mpReq.end()
  } catch(e) { res.status(500).json({ erro: e.message }) }
})

app.get('/', (req, res) => res.json({ status: 'OK' }))

// ===== SISTEMA DE SALAS (MULTIPLAYER) =====
const salas = {}

function gerarCodigo() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let codigo = ''
  for (let i = 0; i < 5; i++) codigo += chars[Math.floor(Math.random() * chars.length)]
  return codigo
}

io.on('connection', (socket) => {
  socket.on('criar-sala', (dados) => {
    const { senha, maxJogadores, modo, nomeCriador } = dados
    let codigo = gerarCodigo()
    while (salas[codigo]) codigo = gerarCodigo()

    salas[codigo] = {
      senha: senha,
      maxJogadores: maxJogadores,
      modo: modo,
      jogadores: [{ id: socket.id, nome: nomeCriador }],
      mundo: null // vai ser preenchido pelo criador logo em seguida, via 'enviar-mundo'
    }

    socket.join(codigo)
    socket.data.sala = codigo
    socket.emit('sala-criada', { codigo, maxJogadores, modo })
  })

  // O criador da sala manda o mundo que ele gerou (blocos, planeta, spawn) pra ficar salvo
  // no servidor, e assim quem entrar depois recebe o MESMO mundo em vez de gerar um aleatório.
  socket.on('enviar-mundo', (dados) => {
    const { codigo, mundo } = dados
    const sala = salas[codigo]
    if (!sala) return
    if (socket.data.sala !== codigo) return // só o dono da sala pode definir o mundo
    sala.mundo = mundo
    // Se já tiver alguém esperando na sala sem mundo ainda, avisa que já chegou
    io.to(codigo).emit('mundo-disponivel', { codigo })
  })

  socket.on('entrar-sala', (dados) => {
    const { codigo, senha, nomeJogador } = dados
    const sala = salas[codigo]

    if (!sala) {
      socket.emit('erro-entrar', { motivo: 'Sala não encontrada' })
      return
    }
    if (sala.senha !== senha) {
      socket.emit('erro-entrar', { motivo: 'Senha incorreta' })
      return
    }
    if (sala.jogadores.length >= sala.maxJogadores) {
      socket.emit('erro-entrar', { motivo: 'Sala cheia' })
      return
    }

    sala.jogadores.push({ id: socket.id, nome: nomeJogador })
    socket.join(codigo)
    socket.data.sala = codigo

    // Manda o mundo do criador junto (se já estiver disponível)
    socket.emit('entrou-na-sala', { codigo, modo: sala.modo, mundo: sala.mundo })
    io.to(codigo).emit('lista-jogadores', sala.jogadores)
  })

  socket.on('disconnect', () => {
    const codigo = socket.data.sala
    if (codigo && salas[codigo]) {
      salas[codigo].jogadores = salas[codigo].jogadores.filter(j => j.id !== socket.id)
      io.to(codigo).emit('lista-jogadores', salas[codigo].jogadores)
      if (salas[codigo].jogadores.length === 0) delete salas[codigo]
    }
  })
})

server.listen(process.env.PORT || 3000)
