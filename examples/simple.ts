import express from 'express';
import { call } from 'cofx';
import fetch from 'node-fetch';

import CofxRouter from '../index';

const app = express();
const port = process.env.PORT || 3000;

const router = CofxRouter();
router.get('/', function*(req, res) {
  const resp = yield call(fetch, 'http://localhost:3000/ping');
  const data = yield call([resp, 'text']);
  res.send(`ping ${data}`);
});
router.get('/ping', function(req, res) {
  res.send('pong');
});

app.use('/', router);

app.listen(port, () => {
  console.log('app running!');
});
