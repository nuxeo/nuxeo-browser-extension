/* eslint-disable max-classes-per-file */

class BaseRule {
  constructor() {
    this.id = -1;
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
  constructor(rootUrl = 'https://connect.nuxeo.com', cookieHeader) {
    super();

    // Set properties
    this.cookieHeader = cookieHeader;
    this.url = rootUrl;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  // eslint-disable-next-line class-methods-use-this
  key() {
    return `cookieHeader-${this.rootUrl}`;
  }

  toJson(priority = 1) {
    return {
      id: this.hashCode(),
      priority,
      condition: {
        urls: `${this.rootUrl}/*`,
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
            scheme: 'https',
            host: this.to.host,
            path: this.to.path,
          },
        },
      },
    };
  }
}

class DeclarativeNetEngine {
  constructor(worker) {
    this.worker = worker;
    this.rules = new Map();
    this.rulesToAdd = [];
    this.rulesToRemove = [];

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
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
    return this.pending()
      .then((pending) => chrome.declarativeNetRequest
        .updateSessionRules(pending))
      .then(() => ({
        addRules: this.rulesToRemove.map((rule) => rule.toJson()),
        removeRuleIds: this.rulesToAdd.map((rule) => rule.id),
      }))
      .then((rules) => {
        // Clear the lists after the changes have been submitted
        this.rulesToAdd = [];
        this.rulesToRemove = [];
        return () => this.undo(rules);
      })
      .catch((cause) => {
        this.worker.developmentMode.asConsole()
          .then((console) => console
            .log(`Failed to flush rules: ${JSON.stringify(this.pending())}`, cause));
        throw cause;
      });
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

  pending() {
    return Promise.resolve({
      addRules: this.rulesToAdd.map((rule) => rule.toJson()),
      removeRuleIds: this.rulesToRemove.map((rule) => rule.id),
    }).then((pending) => {
      this.worker.developmentMode
        .asConsole()
        .then((console) => console
          .log(`Pending rules: ${JSON.stringify(pending)}`));
      return pending;
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
}

export default {
  BasicAuthenticationHeaderRule, CookieHeaderRule, RedirectRule, DeclarativeNetEngine,
};
