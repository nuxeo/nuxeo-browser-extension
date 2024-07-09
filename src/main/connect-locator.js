/* eslint-disable function-paren-newline */
/* eslint-disable comma-dangle */
/* eslint-disable no-sequences */
import CryptoJS from 'crypto-js';
import ServiceWorkerComponent from './service-worker-component';

class ConnectLocator extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    this.decodeBasicAuth = (basic) => atob(basic).split(':');

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });

    // Declare functors
    this.credentialsKeyOf = (location) => {
      const hash = CryptoJS
        .SHA512(location.toString())
        .toString();
      return `connect-locator.credentials.${hash}`;
    };

    this.nuxeoKeyOf = (location) => {
      const hash = CryptoJS
        .SHA512(location.toString())
        .toString();
      return `connect-locator.nuxeo.${hash}`;
    };
  }

  asRegistration(url) {
    return this.worker.serverConnector
      .asRuntimeInfo()
      .then((info) => ({ connectRegistration: { connectUrl: undefined }, ...info }))
      .then((info) => {
        console.log('connect-locator.asRegistration', info);
        return info;
      })
      .then(({ serverUrl: nuxeoUrl, connectRegistration: { connectUrl: connectLocation } }) => {
        if (!connectLocation) {
          return {
            location: 'about:blank',
            credentials: undefined,
            cookiesGranted: false // Assuming no permission needed for 'about:blank'
          };
        }
        const nuxeoKey = this.nuxeoKeyOf(new URL(nuxeoUrl));
        if (url) {
          const { location, credentials } = this.extractCredentialsAndCleanUrl(url);
          const credentialsKey = this.credentialsKeyOf(location);
          return this.worker.browserStore
            .set({ [nuxeoKey]: location, [credentialsKey]: credentials })
            .then((store) => (console.warn('connect-locator.asRegistration', store), store))
            .then(() => this.asRegistration());
        }
        return this.worker.browserStore
          .get({ [nuxeoKey]: connectLocation })
          .then((store) => store[nuxeoKey])
          .then((storedLocation) => chrome.permissions
            .contains({ origins: [`${storedLocation}/*`], permissions: ['cookies'] })
            .then((cookiesGranted) => ({
              location: storedLocation,
              credentialsKey: this.credentialsKeyOf(storedLocation),
              cookiesGranted
            }))
          )
          .then(({ location, credentialsKey, cookiesGranted }) => this.worker
            .browserStore.get({ [credentialsKey]: undefined })
            .then((credentialsStore) => ({
              location,
              credentials: credentialsStore[credentialsKey],
              cookiesGranted
            })));
      });
  }

  // eslint-disable-next-line class-methods-use-this
  extractCredentialsAndCleanUrl(input) {
    const location = typeof input === 'string' ? new URL(input) : input;
    let credentials = null;
    if (location.username || location.password) {
      credentials = btoa(`${location.username}:${location.password}`);
      location.username = '';
      location.password = '';
    }
    location.pathname = location.pathname.replace(/\/?$/, '/').toLowerCase();
    return { location: location.toString(), credentials };
  }

  list() {
    return this.worker.browserStore
      .list()
      .then((store) => Object.keys(store)
        .filter((key) => key.startsWith('connect-locator.'))
        .reduce((obj, key) => {
          obj[key] = store[key];
          return obj;
        }, {}));
  }
}

export default ConnectLocator;
