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
  constructor(worker) {
    super(worker);

    this.groovyScriptManager = new GroovyScriptManager();

    // Define properties
    this.disconnect = () => {};
    this.nuxeo = undefined;
    this.serverUrl = undefined;
    this.project = undefined;

    this.nuxeoUrlOf = (tabLocation) => {
      // eslint-disable-next-line operator-linebreak
      // Regular expression pattern
      const nxPattern = new RegExp([
        '(^https?:\\/\\/[A-Za-z_\\.0-9:-]+\\/[A-Za-z_\\.0-9-]+)', // Match the start of a URL
        '(',
        '\\/(?:',
        '(?:nxdoc|nxpath|nxsearch|nxadmin|nxhome|nxdam|nxdamid|site\\/[A-Za-z_\\.0-9-]+)\\/[A-Za-z_\\.0-9-]+|',
        'view_documents\\.faces|ui\\/|ui\\/#!\\/|view_domains\\.faces|home\\.html|view_home\\.faces',
        '))'
      ].join(''));
      // match and reject non matching URLs
      const matchGroups = nxPattern.exec(tabLocation);
      const isMatching = Boolean(matchGroups && matchGroups[2]);
      const [, extractedLocation] = isMatching ? matchGroups : [];

      return isMatching ? new URL(extractedLocation) : undefined;
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

  checkAvailability() {
    return this.isConnected()
      .then((isConnected) => {
        if (!isConnected) throw new Error('Not connected to Nuxeo');
      });
  }

  onNewLocation(tabLocation) {
    return this.asPromise()
      .then((self) => (this.disconnect(), self))
      .then((self) => {
        const nuxeoUrl = self.nuxeoUrlOf(tabLocation);
        if (nuxeoUrl === undefined) {
          return undefined;
        }
        self.connect(nuxeoUrl);
        return nuxeoUrl;
      });
  }

  connect(serverUrl, tabInfo) {
    const forbiddenDomains = ['connect.nuxeo.com', 'nos-preprod-connect.nuxeo.com'];
    if (forbiddenDomains.includes(serverUrl.host)) {
      return Promise.reject(new Error(`Connection to ${serverUrl.host} is forbidden`));
    }
    this.serverUrl = serverUrl;
    this.nuxeo = new Nuxeo({ baseURL: serverUrl.toString() });
    return this.nuxeo.connect()
      // eslint-disable-next-line no-return-assign
      .then(() => (this.fetchAndSetRuntimeInfo(), this))
      .then(() => {
        // Define disconnect logic here or in a separate method
        this.disconnect = () => {
          this.nuxeo = undefined;
          this.runtimeInfo = undefined;
          this.serverUrl = undefined;
          this.worker.tabNavigationHandler.disableTabExtension(tabInfo);
        };
        this.worker.tabNavigationHandler.enableTabExtension(tabInfo);
        return this;
      })
      .catch((cause) => {
        this.disconnect = () => {};
        this.nuxeo = undefined;
        this.serverUrl = undefined;
        console.warn(`Cannot connect to : ${serverUrl}...`, cause);
        this.worker.desktopNotifier.notify('error', {
          title: `Cannot connect to : ${serverUrl}...`,
          message: `Got errors while accessing nuxeo at ${serverUrl}. Error: ${cause.message}`,
          iconUrl: '../images/access_denied.png',
        });
        return () => {};
      });
  }

  isConnected() {
    return Promise.resolve(this.disconnect != null);
  }

  asRuntimeInfo() {
    if (this.runtimeInfo) {
      return Promise.resolve(this.runtimeInfo);
    }
    return this.fetchAndSetRuntimeInfo();
  }

  fetchAndSetRuntimeInfo() {
    return this.asNuxeo()
      .then((nuxeo) => Promise.all([
        this.asInstalledAddons().catch(() => []), // Return empty array on error
        this.asConnectRegistration().catch(() => ({})), // Return empty object on error
      ])
        // eslint-disable-next-line no-return-assign
        .then(([installedAddons, connectRegistration]) => (this.runtimeInfo = {
          nuxeo,
          serverUrl: nuxeo._baseURL,
          installedAddons,
          connectRegistration,
        })));
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

  asDevelopedStudioProjects() {
    return this.worker.connectLocator
      .asRegistration()
      .then(({ credentials }) => (credentials
        ? this.worker.connectLocator.decodeBasicAuth(credentials)
        : ['', '']))
      .then(([login, token]) => this
        .executeScript('developed-studio-projects', [login, token])
        .then(({ developmentMode, projects }) => Promise
          .all(projects
            .map(({ packageName, isRegistered }) => this.worker.designerLivePreview
              .isEnabled(packageName)
              .then((isDesignerLivePreviewEnabled) => ({
                packageName,
                isRegistered,
                isDesignerLivePreviewEnabled,
                developmentMode,
                serverUrl: this.serverUrl
              }))
              .catch((error) => (
                {
                  packageName,
                  isRegistered,
                  isDesignerLivePreviewEnabled: false,
                  developmentMode,
                  serverUrl: this.serverUrl,
                  inError: {
                    message: error.message,
                    stack: error.stack,
                  }
                }))))));
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

  asNuxeo() {
    return this.worker
      .tabNavigationHandler.asTabInfo()
      .then((tabInfo) => {
        const serverUrl = this.nuxeoUrlOf(tabInfo.url);
        if (serverUrl === undefined) {
          throw new Error(`${tabInfo.url} not handled has a nuxeo URL, are you on the correct tab ?`);
        }
        if (this.nuxeo && this.nuxeo._baseURL === serverUrl.toString()) {
          return this.nuxeo;
        }
        return this.connect(serverUrl, tabInfo)
          .then(() => {
            if (this.nuxeo === undefined) {
              throw new Error(`Cannot connect to ${serverUrl}`);
            }
            return this.nuxeo;
          })
          .catch((error) => {
            this.nuxeo = undefined;
            this.serverUrl = undefined;
            throw error;
          });
      });
  }

  asServerUrl(tabInfo) {
    return this.asPromise()
      .then((self) => self.nuxeoUrlOf(tabInfo))
      .then((nuxeoUrl) => {
        if (!nuxeoUrl) return undefined;
        return fetch(`${nuxeoUrl}/site/automation`, {
          method: 'GET',
          credentials: 'include', // Include cookies in the request
        })
          .then((response) => {
            if (response.ok || response.status !== 401) return response;
            this.worker.desktopNotifier.notify('unauthenticated', {
              title: `Not logged in page: ${tabInfo.url}...`,
              message: 'You are not authenticated. Please log in and try again.',
              iconUrl: '../images/access_denied.png',
            });
            return this.worker.tabNavigationHandler.reloadServerTab({ rootUrl: nuxeoUrl, tabInfo });
          })
          .then((response) => {
            if (response.ok) return response;
            response.text().then((errorText) => {
              this.worker.desktopNotifier.notify('error', {
                title: `Not a Nuxeo server tab : ${tabInfo.url}...`,
                message: `Got errors while accessing automation status page at ${response.url}. Error: ${errorText}`,
                iconUrl: '../images/access_denied.png',
              });
            });
            throw new Error(`Not a nuxeo server tab : ${tabInfo.url}...`);
          })
          .then(() => {
            this.worker.desktopNotifier.cancel('unauthenticated');
            return nuxeoUrl;
          });
      });
  }

  serverErrorDesktopNotification = {
    id: 'server_error',
    options: {
      title: 'Server Error',
      message: 'Please ensure that Dev Mode is activated.',
      iconUrl: '../images/access_denied.png',
    }
  };

  desktopNotify(id, notification) {
    const { title, message, imageUrl } = notification;
    console.group(`Notification: ${id}`);
    console.log(`Title: ${title}`);
    console.log(`Message: ${message}`);
    console.log(`Image URL: ${imageUrl}`);
    console.groupEnd();

    return this.worker
      .desktopNotifier
      .notify(id, { ...this.serverErrorDesktopNotification.options, ...notification });
  }

  desktopCancelNotification(id) {
    return this.worker
      .desktopNotifier
      .cancel(id);
  }

  handleErrors(error, defaultNotification = this.serverErrorDesktopNotification) {
    const toMessage = (response) => {
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        return error.response
          .text()
          .then((text) => ({
            message: `status: ${response.status} ${response.statusText}\ntext: ${text}`
          }));
      }
      return error.response.json();
    };
    return toMessage(error.response)
      .then((json) => {
        const err = error.response.status;
        if (json.message === null) {
          this.desktopNotify('no_hot_reload', {
            ...defaultNotification.options,
            title: 'Hot Reload Operation not found.',
            message: 'Your current version of Nuxeo does not support the Hot Reload function.',
            iconUrl: '/images/access_denied.png',
          });
        } else if (err === 401) {
          this.desktopNotify('access_denied', {
            ...defaultNotification.options,
            title: 'Access denied!',
            message: 'You must have Administrator rights to perform this function.',
            iconUrl: '../images/access_denied.png',
          });
        } else if (err >= 500) {
          this.desktopNotify(defaultNotification.id, {
            ...defaultNotification.options,
            message: `${defaultNotification.message}...\n${json.message}`,
          });
        } else if (err >= 300 && err < 500) {
          this.desktopNotify('bad_login', {
            ...defaultNotification.options,
            title: 'Bad Login',
            message: 'Your Login and/or Password are incorrect',
            iconUrl: '/images/access_denied.png',
          });
        } else {
          this.desktopNotify('unknown_error', {
            ...defaultNotification.options,
            title: 'Unknown Error',
            message: `An unknown error has occurred. Please try again later...\n${json.message}`,
            iconUrl: '/images/access_denied.png',
          });
        }
        return error.response;
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
        return this.handleErrors(cause, this.defaultServerError);
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
    return this.asPromise()
      .then(() => this
        .desktopNotify('reload', {
          title: 'Restarting server...',
          message: `Attempting to restart Nuxeo server (${this.serverUrl})`,
          iconUrl: '../images/nuxeo-128.png',
        }))
      .then(() => this.worker.tabNavigationHandler
        .updateServerTab('site/connectClient/restartView', true))
      .then(() => this
        .desktopCancelNotification('reload'))
      .catch((cause) => {
        this
          .desktopNotify('error', {
            title: 'Something went wrong...',
            message: `An error occurred (${this.serverUrl}) : ${cause.message}`,
            iconUrl: '../images/access_denied.png',
          });
        const error = new Error(`Error restarting server '${cause.message}'`);
        error.cause = cause;
        throw error;
      });
  }
}

export default ServerConnector;
