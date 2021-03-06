# express-cofx-router [![Build Status](https://travis-ci.org/neurosnap/express-cofx-router.svg?branch=master)](https://travis-ci.org/neurosnap/express-cofx-router)

Use [cofx](https://github.com/neurosnap/cofx) with express' router.

## Install

```bash
yarn add express-cofx-router
```

## Usage

```js
import express from 'express';
import { call } from 'cofx';
import fetch from 'node-fetch';
import CofxRouter from 'express-cofx-router';

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
```