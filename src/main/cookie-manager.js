import ServiceWorkerComponent from './service-worker-component';

class CookieManager extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);
    this._domainCookies = new Map();
    this._undoStack = [];

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  enable() {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        const urlObj = new URL(tab.url);
        const domain = urlObj.hostname;
        chrome.cookies.getAll({ domain }, (cookies) => {
          this._domainCookies.set(domain, cookies);
        });
      });
    });
    chrome.cookies.onChanged.addListener(this.onChanged);
    this._undoStack.push(() => chrome.cookies.onChanged.removeListener(this.onCookieChanged));
  }

  disable() {
    this._undoStack.forEach((undo) => undo());
    this._undoStack = [];
  }

  onCookieChanged(changeInfo) {
    const cookieDomain = changeInfo.cookie.domain;
    return this.asPromise()
      .then(() => {
        if (!changeInfo.removed) return;
        // Remove the cookie from the map
        const domainCookies = this._domainCookies.get(cookieDomain);
        if (!domainCookies) return;
        const cookieIndex = domainCookies.findIndex((cookie) => cookie.name === changeInfo.cookie.name);
        if (cookieIndex === -1) {
          return;
        }
        domainCookies.splice(cookieIndex, 1);
      })
      .then(() => {
        if (changeInfo.removed) return;
        // Add or update the cookie in the map
        let domainCookies = this._domainCookies.get(cookieDomain);
        if (!domainCookies) {
          // shoud allocate the entry for the domain
          domainCookies = [];
          this._domainCookies.set(cookieDomain, domainCookies);
        }
        const existingCookie = domainCookies.find((cookie) => cookie.name === changeInfo.cookie.name);
        if (existingCookie) {
          // update cookie
          Object.assign(existingCookie, changeInfo.cookie);
          return;
        }
        // add cookie
        domainCookies.push(changeInfo.cookie);
      });
  }

  cookieHeaderOf(url) {
    const urlObj = new URL(url);
    const scheme = urlObj.protocol.slice(0, -1); // Remove the last character (colon)
    const domain = urlObj.hostname;
    const cookies = this._domainCookies.get(domain);
    if (!cookies) {
      return {
        domain,
        cookieHeader: ''
      };
    }
    return {
      domain,
      cookieHeader: cookies.map((cookie) => {
        if (cookie.secure && scheme !== 'https') {
          return null; // Skip secure cookies if not on https
        }
        if (cookie.httpOnly && !(scheme === 'https' || scheme === 'http')) {
          return null; // Skip httpOnly cookies if not on http or https
        }
        let cookieString = `${cookie.name}=${cookie.value}`;
        if (cookie.secure) {
          cookieString += '; Secure';
        }
        if (cookie.httpOnly) {
          cookieString += '; HttpOnly';
        }
        if (cookie.sameSite) {
          cookieString += `; SameSite=${cookie.sameSite}`;
        }
        return cookieString;
      }).filter(Boolean).join('; ')
    };
  }
}

export default CookieManager;
