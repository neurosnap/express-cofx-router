import { METHODS } from 'http';
import {
  Router,
  RouterOptions,
  IRoute,
  Request,
  Response,
  NextFunction,
} from 'express';
import { PathParams, IRouter } from 'express-serve-static-core';
import { task } from 'cofx';

type Method =
  | 'all'
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'options'
  | 'head'
  | 'checkout'
  | 'copy'
  | 'lock'
  | 'merge'
  | 'mkactivity'
  | 'mkcol'
  | 'move'
  | 'm-search'
  | 'notify'
  | 'purge'
  | 'report'
  | 'search'
  | 'subscribe'
  | 'trace'
  | 'unlock'
  | 'unsubscribe';

type ExpressMethod = Method | 'use' | 'param';

const refineMethod = (s: string): ExpressMethod | null => {
  switch (s) {
    case 'all':
    case 'get':
    case 'post':
    case 'put':
    case 'delete':
    case 'patch':
    case 'options':
    case 'head':
    case 'checkout':
    case 'copy':
    case 'lock':
    case 'merge':
    case 'mkactivity':
    case 'mkcol':
    case 'move':
    case 'm-search':
    case 'notify':
    case 'purge':
    case 'report':
    case 'search':
    case 'subscribe':
    case 'trace':
    case 'unlock':
    case 'unsubscribe':
    case 'use':
    case 'param':
      return s;
    default:
      return null;
  }
};
const refineExpressMethod = (s: ExpressMethod): Method => {
  if (s === 'use' || s === 'param') {
    throw new Error(`unexpected method: ${s}`);
  }
  return s;
};
const baseMethods: ExpressMethod[] = METHODS.map((s) =>
  refineMethod(s.toLocaleLowerCase()),
).filter(Boolean);

const flatten = (array: any[], accu: any[] = []) => {
  array.forEach((a) => {
    if (Array.isArray(a)) {
      flatten(a, accu);
    } else {
      accu.push(a);
    }
  });

  return accu;
};

function wrapHandler(handler: any) {
  if (typeof handler !== 'function') {
    var type = Object.prototype.toString.call(handler);
    var msg = 'Expected a callback function but got a ' + type;
    throw new Error(msg);
  }

  const fn = (args: any[]) => {
    // Find the next function from the arguments
    let next = args.slice(-1)[0];

    // When calling router.param, the last parameter is a string, not next.
    // If so, the next should be the one before it.
    if ('string' === typeof next) {
      next = args.slice(-2)[0];
    }

    return task(handler, ...args)
      .then((d) => {
        if (d === 'next') {
          next();
        } else if (d === 'route') {
          next('route');
        }
      })
      .catch((err) => {
        if (!err) {
          return next(
            new Error(
              'returned promise was rejected but did not have a reason',
            ),
          );
        }

        return next(err);
      });
  };

  if (handler.length === 4) {
    return function(err: any, req: Request, res: Response, next: NextFunction) {
      fn([err, req, res, next]);
    };
  }

  return function(req: Request, res: Response, next: NextFunction) {
    fn([req, res, next]);
  };
}

function wrapRoute(router: IRoute, methods: Method[]): IRoute {
  methods.forEach((method) => {
    const orig = router[method];
    router[method] = (...args: any[]) => {
      const params = findParams(args);
      return orig.apply(router, params);
    };
  });

  return router;
}

function wrapRouter(router: IRouter, methods: ExpressMethod[]): IRouter {
  methods.forEach((method) => {
    const orig = router[method];
    router[method] = (...args: any[]) => {
      const params = findParams(args);
      return orig.apply(router, params);
    };
  });

  return router;
}

const isRegExp = (obj: any): boolean => obj instanceof RegExp;
const isString = (obj: any): boolean => typeof obj === 'string';

interface Params {
  first: any;
  params: any[];
}

const getFirstParam = (args: any[]): Params => {
  const def: Params = {
    first: args[0],
    params: args.slice(1),
  };
  const first = args[0];

  if (isString(first)) {
    return def;
  }

  if (isRegExp(first)) {
    return def;
  }

  if (Array.isArray(first)) {
    const firstEl = first[0];

    if (isString(firstEl)) {
      return def;
    }

    if (isRegExp(firstEl)) {
      return def;
    }
  }

  return {
    first: null,
    params: args,
  };
};

function findParams(args: any[]) {
  const { first, params } = getFirstParam([...args]);
  const flatParams = flatten(params).map(wrapHandler);

  // If we have a route path or something, push it in front
  if (first) {
    flatParams.unshift(first);
  }

  return flatParams;
}

export default function CofxRouter(options?: RouterOptions) {
  const router = wrapRouter(Router(options), [
    ...baseMethods,
    'use',
    'all',
    'param',
  ]);
  const route = router.route;

  router.route = function(opts: PathParams) {
    return wrapRoute(
      route.call(router, opts),
      [...baseMethods, 'all'].map(refineExpressMethod),
    );
  };

  return router;
}
