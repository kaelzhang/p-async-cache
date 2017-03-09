const LRU = require('lru-cache')
const delegate = require('delegates')
const assert = require('assert')
const Queue = require('pending-queue')


class AsyncCache {

  _stringify = JSON.stringify

  constructor (options) {
    assert(Object(options) === options, 'options must be an object')
    assert(typeof options.load === 'function',
      'options.load must be a function')

    this._cache = new LRU(options)
    this._stales = {}

    if (options.stringify) {
      this._stringify = options.stringify
    }

    this._allowStale = options.stale
    this._queue = new Queue({
      load: options.load
    })
    .on('load', (key, value) => {
      delete this._stales[key]
      this._cache.set(key, value)
    })
  }

  _load_if_necessary (key, params) {
    if (this._queue.listenerCount(key) > 1) {
      return
    }

    this._load(key, params)
  }

  _load (key, params) {
    return this._queue.addWithKey(key, ...params)
    .then((value) => {
      return value
    })
  }

  get (...params) {
    const stringify = this._stringify
    const key = stringify(params)

    if (this._allowStale && key in this._stales) {
      this._load_if_necessary(key, params)
      return Promise.resolve({
        value: this._stales[key],
        stale: true
      })
    }

    const has = this._cache.has(key)
    const value = this._cache.get(key)

    if (has) {
      return Promise.resolve({
        value,
        stale: false
      })

    } else if (
      // Maybe the value never exist
      value !== undefined
      && this._allowStale

    ) {
      this._stales[key] = value
      this._load_if_necessary(key, params)
      return Promise.resolve({
        value,
        stale: true
      })
    }

    return this._load(key, params)
    .then((value) => {
      return {
        value,
        stale: false
      }
    })
  }

  reset () {
    return this._cache.reset()
  }
}


const proto = AsyncCache.prototype

'has del peek'.split(' ').forEach(name => {
  proto[name] = function (...params) {
    return this._cache[name](this._stringify(params))
  }
})


Object.defineProperty(AsyncCache.prototype, 'itemCount', {
  get () {
    return this._cache.itemCount
  },
  enumerable: true,
  configurable: true
})

module.exports = AsyncCache
