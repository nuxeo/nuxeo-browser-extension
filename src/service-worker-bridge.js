/* eslint-disable comma-dangle */

class ServiceWorkerBridge {
  bootstrap({ name, entrypoint }) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          extension: 'nuxeo-web-extension',
          component: 'componentInventory',
          action: 'list',
          params: [],
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          if (response && response.error) {
            return reject(response.error);
          }
          this.createProxies(response);
          return resolve(this);
        }
      );
    })
      // eslint-disable-next-line no-return-assign, no-sequences
      .then((worker) => {
        worker[name] = entrypoint;
        return worker.developmentMode
          .asPromise()
          .then(() => {
            // Check if 'window' is defined, otherwise use 'window'
            // eslint-disable-next-line no-restricted-globals, no-undef
            const globalScope = typeof self !== 'undefined' ? self : window;
            // eslint-disable-next-line no-return-assign
            return globalScope.nuxeoWebExtension = worker;
          })
          // eslint-disable-next-line no-sequences
          .catch(() => (worker));
      })
      .then((worker) => (
        // eslint-disable-next-line no-sequences
        entrypoint(worker),
        worker
      ));
  }

  createProxies(components) {
    components.forEach((component) => {
      this[component] = new Proxy({}, {
        get: (target, action) => (...params) => new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            {
              extension: 'nuxeo-web-extension',
              component: `${component}`,
              action,
              params,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else if (response && response.error) {
                const error = new Error(response.error.message);
                error.name = response.error.name;
                error.stack = response.error.stack;
                error.originalError = response.error; // Include the original error
                reject(error);
              } else {
                resolve(response);
              }
            }
          );
        }),
      });
    });
  }

  asPromise() {
    return Promise.resolve(this);
  }
}

export default ServiceWorkerBridge;
