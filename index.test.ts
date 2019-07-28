import express, { Express } from 'express';
import { Server } from 'http';
import fetch from 'node-fetch';
import { delay } from 'cofx';

import CofxRouter from './index';
import {
  IRouter,
  NextFunction,
  Request,
  Response,
} from 'express-serve-static-core';

const GET = (route: string) =>
  fetch('http://localhost:12345' + route)
    .then((res) => {
      // Express sends 500 errors for uncaught exceptions (like failed assertions)
      // Make sure to still fail the test if an assertion in middleware failed.
      expect(res.status).toEqual(200);
      return res;
    })
    .then((res) => res.text());

describe('express-cofx-router', function() {
  let app: Express;
  let serverListening: null | Promise<undefined>;
  let server: Server;
  let router: IRouter;

  const bootstrap = function(router: IRouter) {
    app = express();
    app.use('/', router);

    if (serverListening) {
      throw 'already bootstrapped';
    }

    serverListening = new Promise(function(resolve, reject) {
      server = app.listen(12345, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    return serverListening;
  };

  beforeEach(function() {
    router = CofxRouter();
  });

  afterEach(function() {
    if (serverListening) {
      return serverListening.then(function() {
        server.close();
        app = undefined;
        server = undefined;
        serverListening = undefined;
      });
    }
  });

  describe('CofxRouter()', () => {
    it('should call next with an error when a returned promise is rejected', function() {
      const callback = jest.fn();

      function* foo() {
        yield delay(10);
        throw new Error('some error');
      }

      router.use('/foo', foo);
      router.use(function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        expect(err.message).toEqual('some error');
        callback();
        res.send();
      });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    it('should call next without an error when a returned promise is resolved with "next"', function() {
      const errorCallback = jest.fn();
      const nextCallback = jest.fn();

      function* foo() {
        yield delay(10);
        return 'next';
      }

      router.use('/foo', foo);
      router.use('/foo', function(req, res) {
        nextCallback();
        res.send();
      });
      router.use(function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        errorCallback();
        next();
      });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(errorCallback).not.toHaveBeenCalled();
          expect(nextCallback).toHaveBeenCalledTimes(1);
        });
    });

    it('should not call next when a returned promise is resolved with anything other than "route" or "next"', function() {
      const callback = jest.fn();

      function* foo(req: Request, res: Response) {
        res.send();
        yield delay(10);
        return 'something';
      }

      function* bar(req: Request, res: Response) {
        res.send();
        yield delay(10);
        return {};
      }

      router.get('/foo', foo);
      router.get('/bar', bar);

      router.use(function(req, res) {
        callback();
        res.send(500);
      });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(callback).not.toHaveBeenCalled();
          return GET('/bar');
        })
        .then(function() {
          expect(callback).not.toHaveBeenCalled();
        });
    });

    it('should move to the next middleware when next is called without an error', function() {
      const callback = jest.fn();

      router.use('/foo', function(req, res, next) {
        next();
      });
      router.use('/foo', function(req, res, next) {
        callback();
        res.send();
      });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    it('should move to the next error handler when next is called with an error', function() {
      const callback = jest.fn();
      const errorCallback = jest.fn();

      router.use('/foo', function(req, res, next) {
        next('an error');
      });
      router.use('/foo', function(req, res, next) {
        callback();
        next();
      });
      router.use(function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        expect(err).toEqual('an error');
        errorCallback();
        res.send();
      });

      return bootstrap(router)
        .then(function() {
          return GET('/foo');
        })
        .then(function() {
          expect(errorCallback).toHaveBeenCalledTimes(1);
          expect(callback).not.toHaveBeenCalled();
        });
    });

    it('should call chained handlers in the correct order', function() {
      const fn2 = jest.fn(function(req, res) {
        res.send();
      });
      const fn1 = jest.fn(function() {
        expect(fn2).not.toHaveBeenCalled();
        return Promise.resolve('next');
      });

      router.get('/foo', fn1, fn2);

      return bootstrap(router).then(function() {
        return GET('/foo');
      });
    });

    it('should correctly call an array of handlers', function() {
      const fn2 = jest.fn(function(req, res) {
        res.send();
      });
      const fn1 = jest.fn(function() {
        expect(fn2).not.toHaveBeenCalled();
        return Promise.resolve('next');
      });

      router.get('/foo', [[fn1], [fn2]] as any);

      return bootstrap(router).then(function() {
        return GET('/foo');
      });
    });

    it('should call next("route") if a returned promise is resolved with "route"', function() {
      const fn1 = function() {
        return Promise.resolve('route');
      };
      const fn2 = function() {
        fail();
      };

      router.get('/foo', fn1, fn2);
      router.get('/foo', function(req, res) {
        res.send();
      });

      return bootstrap(router).then(function() {
        return GET('/foo');
      });
    });

    it('should bind to RegExp routes', function() {
      const fn1 = function(req: Request, res: Response) {
        res.send();
      };

      router.get(/^\/foo/, fn1);

      return bootstrap(router).then(function() {
        return GET('/foo');
      });
    });

    it('multiple calls to handlers that have used "next" should not interfere with each other', function() {
      const fn = jest.fn(function(req, res, next) {
        if (fn.mock.calls.length === 1) {
          next('error');
        } else {
          setTimeout(function() {
            res.status(200).send('ok');
          }, 15);
        }
      });
      const errHandler = function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        if (err === 'error') {
          res.send('fail');
        } else {
          next(err);
        }
      };

      router.get('/foo', fn, errHandler);

      return bootstrap(router)
        .then(function() {
          return GET('/foo');
        })
        .then(function(res) {
          expect(res).toEqual('fail');
          return GET('/foo');
        })
        .then(function(res) {
          expect(res).toEqual('ok');
        });
    });

    it('calls next if next is called even if the handler returns a promise', function() {
      const fn = function(req: Request, res: Response, next: NextFunction) {
        next();
        return new Promise(function(resolve, reject) {});
      };
      const fn2 = function(req: Request, res: Response) {
        res.send('ok');
      };
      const errHandler = function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        res.send('error');
      };

      router.get('/foo', fn, fn2, errHandler);

      return bootstrap(router)
        .then(function() {
          return GET('/foo');
        })
        .then(function(res) {
          expect(res).toEqual('ok');
        });
    });

    it('calls next with an error if the returned promise is rejected with no reason', function() {
      function* fn() {
        yield delay(10);
        throw new Error(null);
      }

      const errHandler = function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        res.send('error');
      };

      router.get('/foo', fn, errHandler);

      return bootstrap(router)
        .then(function() {
          return GET('/foo');
        })
        .then(function(res) {
          expect(res).toEqual('error');
        });
    });

    it('should handle resolved promises returned in req.param() calls', function() {
      function* id() {
        yield delay(10);
        return 'next';
      }
      router.param('id', id);
      router.use('/foo/:id', function(req, res) {
        res.send('done');
      });

      return bootstrap(router)
        .then(function() {
          return GET('/foo/1');
        })
        .then(function(res) {
          expect(res).toEqual('done');
        });
    });

    it('should call next with unresolved promises returned in req.param() calls', function() {
      const assertOutput = 'error in param';

      function* id() {
        yield delay(10);
        throw new Error(assertOutput);
      }
      router.param('id', id);

      const fn = function(req: Request, res: Response) {
        res.send('done');
      };

      const errHandler = function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        res.send(err.message);
      };

      router.use('/foo/:id', fn);
      router.use(errHandler);

      return bootstrap(router)
        .then(function() {
          return GET('/foo/1');
        })
        .then(function(res) {
          expect(res).toEqual(assertOutput);
        });
    });

    it('support array in routes values', function() {
      router.use(['/', '/foo/:bar'], function(req, res) {
        res.send('done');
      });

      return bootstrap(router)
        .then(function() {
          return GET('/');
        })
        .then(function(res) {
          expect(res).toEqual('done');

          return GET('/foo/1');
        })
        .then(function(res) {
          expect(res).toEqual('done');
        });
    });

    it('should throw sensible errors when handler is not a function', function() {
      expect(function() {
        router.use('/foo/:id', null);
      }).toThrow(/callback/);
    });
  });

  describe('CofxRouter().route(...)', () => {
    it('should call next with an error when generator throws error', function() {
      const callback = jest.fn();

      function* getFoo(req: Request, res: Response) {
        yield delay(10);
        throw new Error('some error');
      }

      router.route('/foo').get(getFoo);

      router.use(function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        expect(err.message).toEqual('some error');
        callback();
        res.send();
      });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(() => {
          expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    it('should call next without an error when a returned promise is resolved with "next"', function() {
      const errorCallback = jest.fn();
      const nextCallback = jest.fn();

      function* getFoo(req: Request, res: Response) {
        yield delay(10);
        return 'next';
      }

      router
        .route('/foo')
        .get(getFoo)
        .all(function(req, res) {
          nextCallback();
          res.send();
        });

      router.use(
        (err: any, req: Request, res: Response, next: NextFunction) => {
          errorCallback();
          next();
        },
      );

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(errorCallback).not.toHaveBeenCalled();
          expect(nextCallback).toHaveBeenCalledTimes(1);
        });
    });

    it('should move to the next middleware when next is called without an error', function() {
      const callback = jest.fn();

      router
        .route('/foo')
        .get(function(req, res, next) {
          next();
        })
        .all(function(req, res, next) {
          callback();
          res.send();
        });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    it('should move to the next error handler when next is called with an error', function() {
      const callback = jest.fn();
      const errorCallback = jest.fn();

      router
        .route('/foo')
        .get(function(req, res, next) {
          next('an error');
        })
        .all(function(req, res, next) {
          callback();
          next();
        });
      router.use(function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        expect(err).toEqual('an error');
        errorCallback();
        res.send();
      });

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function() {
          expect(errorCallback).toHaveBeenCalledTimes(1);
          expect(callback).not.toHaveBeenCalled();
        });
    });

    it('should call chained handlers in the correct order', function() {
      const fn2 = jest.fn((req, res) => {
        res.send();
      });

      const fn1 = jest.fn(() => {
        expect(fn2).not.toHaveBeenCalled();
        return Promise.resolve('next');
      });

      router.route('/foo').get(fn1, fn2);

      return bootstrap(router).then(() => GET('/foo'));
    });

    it('should correctly call an array of handlers', function() {
      const fn2 = jest.fn((req, res) => {
        res.send();
      });

      const fn1 = jest.fn(() => {
        expect(fn2).not.toHaveBeenCalled();
        return Promise.resolve('next');
      });

      router.route('/foo').get([[fn1], [fn2]] as any);

      return bootstrap(router).then(() => GET('/foo'));
    });

    it('should call next("route") if a returned promise is resolved with "route"', function() {
      const fn1 = () => Promise.resolve('route');
      const fn2 = () => fail();

      router.route('/foo').get(fn1, fn2);

      router.route('/foo').get(function(req, res) {
        res.send();
      });

      return bootstrap(router).then(() => GET('/foo'));
    });

    it('should bind to RegExp routes', function() {
      const fn1 = (req: Request, res: Response) => {
        res.send();
      };

      router.route(/^\/foo/).get(fn1);

      return bootstrap(router).then(() => GET('/foo'));
    });

    it('multiple calls to handlers that have used "next" should not interfere with each other', function() {
      const fn = jest.fn((req, res, next) => {
        if (fn.mock.calls.length === 1) {
          next('error');
        } else {
          setTimeout(function() {
            res.status(200).send('ok');
          }, 15);
        }
      });

      const errHandler = function(
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) {
        if (err === 'error') {
          res.send('fail');
        } else {
          next(err);
        }
      };

      router.route('/foo').get(fn, errHandler);

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function(res) {
          expect(res).toEqual('fail');
          return GET('/foo');
        })
        .then(function(res) {
          expect(res).toEqual('ok');
        });
    });

    it('calls next if next is called even if the handler returns a promise', function() {
      const fn = (req: Request, res: Response, next: NextFunction) => {
        next();
        return new Promise(function(resolve, reject) {});
      };
      const fn2 = (req: Request, res: Response) => {
        res.send('ok');
      };
      const errHandler = (
        err: any,
        req: Request,
        res: Response,
        next: NextFunction,
      ) => {
        res.send('error');
      };

      router.route('/foo').get(fn, fn2, errHandler);

      return bootstrap(router)
        .then(() => GET('/foo'))
        .then(function(res) {
          expect(res).toEqual('ok');
        });
    });

    it('should handle resolved promises returned in req.param() calls', function() {
      function* id() {
        yield delay(10);
        return 'next';
      }

      router.param('id', id);
      router.route('/foo/:id').all(function(req, res) {
        res.send('done');
      });

      return bootstrap(router)
        .then(() => GET('/foo/1'))
        .then(function(res) {
          expect(res).toEqual('done');
        });
    });
  });
});
