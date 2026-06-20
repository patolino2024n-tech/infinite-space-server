const express = require('express')
const cors = require('cors')
const https = require('https')
const app = express()
app.use(cors())
app.use(express.json())
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
app.listen(process.env.PORT || 3000)
