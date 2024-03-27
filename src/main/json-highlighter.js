import ServiceWorkerComponent from './service-worker-component';

class JsonHighlighter extends ServiceWorkerComponent {
  // eslint-disable-next-line no-unused-vars
  constructor(worker) {
    super(worker);

    this._input = '';

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  input(input) {
    if (input) {
      this._input = input;
    }
    return new Promise((resolve, reject) => {
      if (!this.input) {
        reject(new Error('No json input text provided'));
      }
      resolve(this._input);
    });
  }

  withEnabled(value) {
    const method = this.worker.browserStore[value ? 'set' : 'get'];
    const data = value ? { 'json-highlighter-enabled': value } : { 'json-highlighter-enabled': true };

    return method.apply(this.worker.browserStore, [data])
      .then((store) => store['json-highlighter-enabled']);
  }
}

export default JsonHighlighter;
