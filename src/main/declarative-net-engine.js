/* eslint-disable max-classes-per-file */
import ServiceWorkerComponent from './service-worker-component';

class BaseRule {
  constructor() {
    this.priority = 1;
  }

  hashCode() {
    const key = this.key();
    let hash = 0;
    if (key.length === 0) return hash;
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      // eslint-disable-next-line no-bitwise
      hash = ((hash << 5) - hash) + char;
      // eslint-disable-next-line no-bitwise
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash); // Ensure the hash is always positive
  }
}

class CookieHeaderRule extends BaseRule {
  constructor(domain = 'connect.nuxeo.com', cookieHeader) {
    super();

    // Set properties
    this.cookieHeader = cookieHeader;
    this.domain = domain;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  // eslint-disable-next-line class-methods-use-this
  key() {
    return `cookieHeader-${this.domain}`;
  }

  toJson(priority = 1) {
    return {
      id: this.hashCode(),
      priority,
      condition: {
        urlFilter: `*://${this.domain}/*`
      },
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Cookie',
            operation: 'set',
            value: this.cookieHeader,
          },
        ],
      },
    };
  }
}

class BasicAuthenticationHeaderRule extends BaseRule {
  constructor(url, credentials) {
    super();

    // Set properties
    this.credentials = credentials;
    this.url = url;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  // eslint-disable-next-line class-methods-use-this
  key() {
    return `authHeader-${this.url}`;
  }

  toJson(priority = 1) {
    return {
      id: this.hashCode(this.url),
      priority,
      condition: {
        urlFilter: `${this.url}`,
      },
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          {
            header: 'Authorization',
            operation: 'set',
            value: `Basic ${this.credentials}`,
          },
        ],
      },
    };
  }
}

class RedirectRule extends BaseRule {
  constructor(from, to) {
    super();

    // Set properties
    this.from = from;
    this.to = to;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  key() {
    return `redirection-${this.from}`;
  }

  toJson(priority = 1) {
    return {
      id: this.hashCode(),
      priority,
      condition: {
        urlFilter: this.from.toString(),
      },
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            scheme: this.to.protocol.slice(0, -1), // Use the scheme from the `to` URL
            host: this.to.host,
            port: (this.to.port && this.to.port !== '') ? this.to.port : '443', // Handle the case where the port is an empty string
            path: this.to.pathname,
          },
        },
      },
    };
  }
}

class DeclarativeNetEngine extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    // Define properties
    this.rules = new Map();
    this.rulesToAdd = [];
    this.rulesToRemove = [];

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });

    // Define functors
    this.requestOf = (rulesToAdd, rulesToRemove) => ({
      addRules: rulesToAdd.map((rule) => rule.toJson()),
      removeRuleIds: rulesToRemove.map((rule) => rule.hashCode()),
    });
  }

  push(rule) {
    return Promise.resolve(rule)
      .then((r) => {
        this.rules.set(rule.keyOf, r);
        this.rulesToAdd.push(r);
        return r;
      })
      .then((r) => {
        this.worker.developmentMode
          .asConsole()
          .then((console) => console
            .log(`Pushed rule: ${JSON.stringify(r.toJson())}`));
        return r;
      });
  }

  pop(key) {
    return Promise.resolve(key)
      .then((k) => {
        const rule = this.rules[k];
        this.rules.delete(k);
        this.rulesToRemove.push(rule);
        return rule;
      })
      .then((rule) => {
        this.worker.developmentMode
          .asConsole()
          .then((console) => console
            .log(`Popped rule: ${JSON.stringify(rule.toJson())}`));
        return rule;
      });
  }

  flush() {
    return Promise
      .resolve({
        pendingRules: this.requestOf(this.rulesToAdd, this.rulesToRemove),
        undoRules: this.requestOf(this.rulesToRemove, this.rulesToAdd),
      })
      .then(({ pendingRules, undoRules }) => chrome.declarativeNetRequest
        .updateSessionRules(pendingRules)
        .catch((cause) => {
          this.worker.developmentMode.asConsole()
            .then((console) => console
              .log(`Failed to flush rules: ${JSON.stringify(pendingRules)}`, cause));
          throw cause;
        })
        .then(() => {
          this.rulesToAdd = [];
          this.rulesToRemove = [];
        })
        .then(() => () => chrome.declarativeNetRequest
          .updateSessionRules(undoRules))
        .then((undo) => this.worker.developmentMode.asConsole()
          .then((console) => console.log(`Successfully flushed rules: ${JSON.stringify(pendingRules)}`))
          .then(() => undo)));
  }

  pending() {
    return Promise.resolve(this.requestOf(this.rulesToAdd, this.rulesToRemove));
  }

  // eslint-disable-next-line class-methods-use-this
  undo(rules) {
    return chrome.declarativeNetRequest
      .updateSessionRules(rules)
      .then(() => this.worker.developmentMode.asConsole()
        .then((console) => console
          .log(`Successfully undid flush of rules: ${JSON.stringify(rules)}`)))
      .catch((cause) => {
        this.worker.developmentMode.asConsole()
          .then((console) => console
            .log(`Failed to undo flush of rules: ${JSON.stringify(rules)}`, cause));
        throw cause;
      });
  }

  flushed() {
    return Promise.resolve()
      .then(() => chrome.declarativeNetRequest.getSessionRules())
      .then((rules) => {
        this.worker.developmentMode
          .asConsole()
          .then((console) => console
            .log(`Flushed rules: ${JSON.stringify(rules)}`));
        return rules;
      });
  }

  redirectRulesFrom(from) {
    return Array.from(this.rules.entries())
      .filter(([key, rule]) => rule.type === 'redirect' && key.toString().startsWith(from.toString()))
      .map(([, rule]) => rule);
  }

  clear() {
    this.rulesToRemove.push(...Array.from(this.rules.values()));
    this.rules.clear();
    return this.flush();
  }

  reset() {
    this.rules = new Map();
    this.rulesToAdd = [];
    this.rulesToRemove = [];
    return chrome.declarativeNetRequest
      .getSessionRules()
      .then((rules) => {
        const ruleIds = rules.map((rule) => rule.id);
        return chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: ruleIds,
        });
      })
      .catch((error) => {
        console.error('Failed to remove dynamic rules:', error);
      });
  }

  setCookieHeader({ domain, cookie }) {
    return this
      .push(new CookieHeaderRule(domain, cookie))
      .then(() => this.flush());
  }
}

export default {
  BasicAuthenticationHeaderRule, CookieHeaderRule, RedirectRule, DeclarativeNetEngine,
};
