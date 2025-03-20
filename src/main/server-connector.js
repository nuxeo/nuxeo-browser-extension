/* eslint-disable no-sequences */
/* eslint-disable comma-dangle */
/* eslint-disable max-classes-per-file */
import CryptoJS from 'crypto-js';
import Nuxeo from 'nuxeo';
import ServiceWorkerComponent from './service-worker-component';
import scripts from './groovy';

class GroovyScriptManager {
  constructor() {
    this.scripts = scripts;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  interpolate(name, ...args) {
    if (!this.scripts[name]) {
      throw new Error(`Script ${name} does not exist`);
    }
    const scriptBody = this.scripts[name].call(this.scripts, ...args);
    return Promise.resolve(scriptBody);
  }
}

class ServerConnector extends ServiceWorkerComponent {
  static noop = () => {};

  constructor(worker) {
    super(worker);

    this.groovyScriptManager = new GroovyScriptManager();

    // Define properties
    this.disconnect = this.noop;
    this.nuxeo = undefined;
    this.serverUrl = undefined;
    this.project = undefined;

    this.serverUrlOf = (tabLocation) => {
      // Simplified regular expression pattern to match the web context
      const pattern = new RegExp('^(https?:\\/\\/[A-Za-z_\\.0-9:-]+\\/)([A-Za-z_\\.0-9-]+)');

      // Execute the pattern on the tabLocation
      const matchGroups = pattern.exec(tabLocation);

      // Check if there is a match
      const isMatching = Boolean(matchGroups && matchGroups[1] && matchGroups[2]);

      // Extract the web context if matched
      return isMatching ? new URL(`${matchGroups[1]}${matchGroups[2]}`) : undefined;
    };

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });

    // Declare functors
    this.registrationKeyOf = ({ connectUrl, nuxeoUrl, projectName }) => {
      const hash = CryptoJS
        .SHA512(`${connectUrl}-${nuxeoUrl}-${projectName}`)
        .toString();
      return `server-connector.${hash}`;
    };
  }

  checkOperableDomain(serverUrl, connectOptions) {
    const { forceForbiddenDomains } = connectOptions;
    const forbiddenDomains = [
      { host: 'connect.nuxeo.com', production: true },
      { host: 'nos-preprod-connect.nuxeocloud.com', production: false },
    ];
    const forbiddenDomainByHost = forbiddenDomains.reduce((acc, domain) => {
      acc[domain.host] = domain;
      return acc;
    }, {});
    // check domains
    if (
      forceForbiddenDomains ||
      !(serverUrl.host in forbiddenDomainByHost)) {
      return Promise.resolve();
    }
    const forbiddenDomain = forbiddenDomainByHost[serverUrl.host];
    // should use another way to detect a connect server
    let notification = {
      id: 'forbidden_domain',
      options: {
        ...ServerConnector.serverErrorDesktopNotification.options,
        message: `
You are trying to connect to a Nuxeo Connect server.
This extension is only compatible with Nuxeo Platform servers.
`
      }
    };
    const isDevelopmentMode = this.worker.developmentMode.isEnabled();
    if (isDevelopmentMode && !forbiddenDomain.production) {
      notification = {
        ...notification,
        buttons: [
          { title: 'Force' },
          { title: 'Close' }
        ],
        requireInteraction: true,
      };
      notification.requireInteraction = true; // Keep the notification until an action is taken
    }

    return Promise.reject(this.connectionErrorOf(`Connection to ${serverUrl.host} is forbidden`, notification));
  }

  async connect(serverUrl, tabInfo, connectOptions = { forceForbiddenDomains: false }) {
    await this.checkOperableDomain(serverUrl, connectOptions);

    try {
      this.nuxeo = await new Nuxeo({ baseURL: serverUrl }).connect();
      this.serverUrl = serverUrl;
    } catch (cause) {
      this.disconnect = this.noop;
      this.nuxeo = undefined;
      this.runtimeInfo = undefined;
      this.serverUrl = undefined;

      const notification = this.notifyError(cause);
      this.connectionErrorOf(`Cannot establish connection with ${serverUrl}`, notification);
      return;
    }

    let installedAddons = [];
    let connectRegistration = [];
    if (this.nuxeo.user.isAdministrator) {
      try {
        installedAddons = await this.asInstalledAddons();
        connectRegistration = await this.asConnectRegistration();
      } catch (_) {
      }
    }

    this.runtimeInfo = {
      nuxeo: this.nuxeo,
      serverUrl: this.nuxeo._baseURL,
      installedAddons: installedAddons,
      connectRegistration: connectRegistration
    };
    this.disconnect = () => {
      this.nuxeo = undefined;
      this.runtimeInfo = undefined;
      this.serverUrl = undefined;
      this.worker.tabNavigationHandler.disableTabExtension(tabInfo);
    };

    this.worker.tabNavigationHandler.enableTabExtension(tabInfo);
  }

  isConnected() {
    return Promise
      .resolve(this.disconnect !== this.noop);
  }

  checkLiveConnection() {
    return this.isConnected()
      .then((isConnected) => {
        if (!isConnected) return false;
        return this.nuxeo
          .users()
          .fetch(this.nuxeo.user.username)
          .then(() => true);
      });
  }

  asRuntimeInfo() {
    if (!this.runtimeInfo) {
      return Promise.reject(this.connectionErrorOf('Not connected to Nuxeo'));
    }
    return Promise.resolve(this.runtimeInfo);
  }

  asConnectLocation() {
    return this.executeScript('connect-location');
  }

  asConnectRegistration() {
    return this
      .executeScript('connect-registration')
      .then((result) => ({ ...result, serverUrl: this.serverUrl }))
      .catch((cause) => ({ cause, serverUrl: this.serverUrl }));
  }

  asInstalledAddons() {
    return this.executeScript('installed-addons');
  }

  async asDevelopedStudioProjects() {
    const { credentials } = await this.worker.connectLocator.asRegistration();
    const [login, token] = credentials
      ? this.worker.connectLocator.decodeBasicAuth(credentials)
      : ['', ''];

    const { developmentMode, projects } = await this.executeScript('developed-studio-projects', [login, token]);

    return Promise.all(
      projects.map(async ({ packageName, isRegistered }) => {
        const isDesignerLivePreviewEnabled = await this.worker.designerLivePreview
          .isEnabled(packageName)
          .catch(() => false);

        return {
          packageName,
          isRegistered,
          isDesignerLivePreviewEnabled,
          developmentMode,
          serverUrl: this.serverUrl,
          ...(isDesignerLivePreviewEnabled === false && {
            inError: { message: 'Failed to check designer live preview status' },
          }),
        };
      })
    );
  }

  registerDevelopedStudioProject(projectName) {
    // register or restore CLID for project
    return this
      .registeredStudioProject()
      .then(({ connectUrl, clid: { CLID: clid }, package: { name: packageName } }) => {
        const previousKey = this.registrationKeyOf({
          connectUrl,
          nuxeoUrl: this.serverUrl,
          projectName: packageName,
        });
        const nextKey = this.registrationKeyOf({
          connectUrl,
          nuxeoUrl: this.serverUrl,
          projectName
        });
        return this.worker.browserStore.get({ [previousKey]: clid, [nextKey]: undefined })
          .then(() => ({
            connectUrl, clid
          }));
      })
      .then(({ connectUrl, clid }) => this.worker.connectLocator
        .asRegistration(connectUrl)
        .then(({ credentials }) => this.worker.connectLocator.decodeBasicAuth(credentials))
        .then(([login, token]) => this
          .executeScript('register-developed-studio-project', [login, token, projectName, clid])));
  }

  asNuxeo(connectionOptions) {
    return this.worker.tabNavigationHandler
      .asTabInfo()
      .then((tabInfo) => {
        const serverUrl = this.serverUrlOf(tabInfo.url);
        const attemptConnection = () => this.connect(serverUrl, tabInfo, connectionOptions).then(() => this.nuxeo);
        const urlEquals = (url1, url2) => url1.protocol === url2.protocol &&
          url1.hostname === url2.hostname &&
          url1.port === url2.port &&
          url1.pathname === url2.pathname;
        if (this.nuxeo !== undefined && urlEquals(this.nuxeo._baseURL, serverUrl) && this.nuxeo.connected) {
          // Attempt to refetch the logged user to ensure connection is still valid
          const refetchUser = () => this.nuxeo.users().fetch(this.nuxeo.user.id);
          return refetchUser()
            .then(() => this.nuxeo) // Connection is valid
            .catch((error) => {
              console.error('Failed to refetch the user, connection might be lost.', error);
              return attemptConnection();
            });
        }
        // Not connected or different server, attempt to connect
        return attemptConnection();
      });
  }

  static serverErrorDesktopNotification = {
    id: 'server_error',
    options: {
      title: 'Server Error',
      message: 'Please ensure that Dev Mode is activated.',
      iconUrl: '../images/access_denied.png',
    }
  };

  // eslint-disable-next-line class-methods-use-this
  connectionErrorOf(message, options = ServerConnector.serverErrorDesktopNotification) {
    class ConnectionError extends Error {
      constructor() {
        super(message);
        this.notification = options;
      }
    }
    return new ConnectionError(message);
  }

  desktopNotify(id = ServerConnector.serverErrorDesktopNotification.id, notification) {
    return this.worker
      .desktopNotifier
      .notify(id, { ...ServerConnector.serverErrorDesktopNotification.options, ...notification });
  }

  desktopCancelNotification(id) {
    return this.worker
      .desktopNotifier
      .cancel(id);
  }

  notifyError(cause) {
    const jsonErrorOf = (response) => {
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        return cause.response
          .text()
          .then((text) => ({
            message: `status: ${response.status} ${response.statusText}\ntext: ${text}`
          }));
      }
      return cause.response.json();
    };
    return jsonErrorOf(cause.response)
      .then((json) => {
        const status = cause.response.status;
        if (json.message === null) {
          return this.desktopNotify('no_hot_reload', {
            title: 'Hot Reload Operation not found.',
            message: 'Your current version of Nuxeo does not support the Hot Reload function.',
          });
        }
        if (status === 401) {
          return this.desktopNotify('access_denied', {
            title: 'Access denied!',
            message: 'You should login to interact with the nuxeo web extension.',
          });
        }
        if (status >= 500) {
          return this.desktopNotify();
        }
        if (status >= 300 && status < 500) {
          return this.desktopNotify('bad_login', {
            title: 'Bad Login',
            message: 'Your Login and/or Password are incorrect',
          });
        }
        return this.desktopNotify('unknown_error', {
          title: 'Unknown Error',
          message: `An unknown error has occurred. Please try again later...\n${json.message}`,
        });
      });
  }

  executeScript(name, parms = [], outputType = 'application/json') {
    return this.groovyScriptManager
      .interpolate(name, ...parms)
      .then((scriptBody) => this.executeScriptBody(name, scriptBody, outputType));
  }

  executeScriptBody(name, body, outputType = 'application/json') {
    const blob = new Nuxeo.Blob({
      content: new Blob([body], {
        type: 'text/plain',
      }),
      name,
      mymeType: 'text/plain',
    });
    return this
      .executeOperation('RunInputScript', { type: 'groovy' }, blob, outputType);
  }

  executeOperation(operationId, params = {}, input = undefined, outputType = 'application/json') {
    return this.asNuxeo().then((nuxeo) => nuxeo
      .operation(operationId)
      .params(params)
      .input(input)
      .execute()
      .then((response) => {
        if (!(response instanceof Response)) {
          // usual case, nuxeo has unmarshalled the JSON response
          return response;
        }
        if (outputType !== 'application/json') {
          // don't know how to deal with
          return response;
        }
        if (response.status === 204) {
          // no content. return empty object
          return '{}';
        }
        // parse the JSON response, should never occurs
        return response.json();
      })
      .catch((cause) => {
        if (!cause.response) {
          throw cause;
        }
        return this.notifyError(cause);
      }));
  }

  query(input, schemas = ['dublincore', 'common', 'uid']) {
    return this.asNuxeo()
      .then((nuxeo) => {
        const userid = nuxeo.user.id;
        const defaultSelectClause = '* FROM Document';
        const defaultWhereClause = `ecm:path STARTSWITH "/default-domain/UserWorkspaces/${userid}"`;
        const defaultQuery = `SELECT ${defaultSelectClause} WHERE ${defaultWhereClause}"`;
        const defaultSortBy = 'dc:modified DESC';

        if (!input || (typeof input === 'object' && !input.query)) {
          input.query = defaultQuery;
        }
        if (!input.sortBy) {
          input.sortBy = defaultSortBy;
        }

        return nuxeo
          .repository()
          .schemas(schemas)
          .query(input);
      });
  }

  restart() {
    return Promise.resolve()
      .then(() => this.worker.tabNavigationHandler
        .updateServerTab(`${this.serverUrl}/site/connectClient/restartView`, false))
      .catch((cause) => this
        .desktopNotify('error', {
          title: 'Something went wrong...',
          message: `An error occurred (${this.serverUrl}) : ${cause?.message}`,
          iconUrl: '../images/access_denied.png',
        })
        .then((notification) => Promise
          .reject(new Error(notification.options.message))));
  }
}

export default ServerConnector;
