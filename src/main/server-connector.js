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

  onNewLocation(serverUrl) {
    return this.isConnected()
      .then((isConnected) => {
        if (isConnected) this.disconnect();
        return false;
      })
      .then(() => (serverUrl ? this.connect(serverUrl) : Promise.resolve()));
  }

  connect(serverUrl) {
    this.nuxeo = new Nuxeo({ baseURL: serverUrl });
    this.serverUrl = serverUrl;
    return this.nuxeo
      .login()
      // eslint-disable-next-line no-return-assign
      .then(() => {
        chrome.omnibox.onInputChanged.addListener(this.onInputChanged = this.suggestDocument);
      })
      .then(() => () => {
        this.disconnect = undefined;
        this.nuxeo = undefined;
        this.serverUrl = undefined;
        chrome.omnibox.onInputChanged.removeListener(this.suggestDocument);
      })
      .then((disconnect) => {
        this.disconnect = disconnect.bind(this);
        return this.disconnect;
      })
      .catch((cause) => {
        if (cause.response) {
          this.handleErrors(cause, this.defaultServerError);
          return () => {};
        }
        console.warn('Error connecting to Nuxeo', cause);
        throw cause;
      });
  }

  isConnected() {
    return Promise.resolve(this.disconnect != null);
  }

  asRuntimeInfo() {
    return Promise.all([
      this.asConnectLocation(),
      this.asInstalledAddons(),
      this.asRegisteredStudioProject()
    ])
      .then(([connectLocation, installedAddons, registredStudioProject]) => ({
        nuxeo: this.nuxeo,
        serverUrl: this.serverUrl,
        connectUrl: connectLocation,
        installedAddons,
        registredStudioProject,
      }));
  }

  asConnectLocation() {
    return this.executeScript('connect-location');
  }

  asRegisteredStudioProject() {
    return this.executeScript('registered-studio-project');
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
        .then((projects) => Promise
          .all(projects
            .map(({ packageName, isRegistered }) => this.worker.designerLivePreview
              .isEnabled(packageName)
              .then((isDesignerLivePreviewEnabled) => ({
                packageName,
                isRegistered,
                isDesignerLivePreviewEnabled
              }))
              .catch((error) => (
                {
                  packageName,
                  isRegistered,
                  isDesignerLivePreviewEnabled: false,
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
    return new Promise((resolve, reject) => {
      if (this.nuxeo) {
        resolve(this.nuxeo);
      } else {
        reject(new Error('Not connected to Nuxeo'));
      }
    });
  }

  defaultServerError = {
    id: 'server_error',
    title: 'Server Error',
    message: 'Please ensure that Dev Mode is activated.',
    imageUrl: '../images/access_denied.png',
    interaction: false,
  };

  handleErrors(error, serverError) {
    error.response.json().then((json) => {
      const msg = json.message;
      const err = error.response.status;
      if (msg == null) {
        this.worker.desktopNotifier.notify('no_hot_reload', {
          title: 'Hot Reload Operation not found.',
          message: 'Your current version of Nuxeo does not support the Hot Reload function.',
          iconUrl: '/images/access_denied.png',
          requireInteraction: false
        });
      } else if (err === 401) {
        this.worker.desktopNotifier.notify('access_denied', {
          title: 'Access denied!',
          message: 'You must have Administrator rights to perform this function.',
          iconUrl: '../images/access_denied.png',
          requireInteraction: false
        });
      } else if (err >= 500) {
        this.worker.desktopNotifier.notify(serverError.id, {
          title: serverError.title,
          message: serverError.message,
          iconUrl: serverError.imageUrl,
          requireInteraction: serverError.interaction
        });
      } else if (err >= 300 && err < 500) {
        this.worker.desktopNotifier.notify('bad_login', {
          title: 'Bad Login',
          message: 'Your Login and/or Password are incorrect',
          iconUrl: '/images/access_denied.png',
          requireInteraction: false
        });
      } else {
        this.worker.desktopNotifier.notify('unknown_error', {
          title: 'Unknown Error',
          message: 'An unknown error has occurred. Please try again later.',
          iconUrl: '/images/access_denied.png',
          requireInteraction: false
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
    const notifyRestart = () => new Promise((resolve) => this.worker.desktopNotifier
      .notify('reload', {
        title: 'Restarting server...',
        message: `Attempting to restart Nuxeo server (${this.serverUrl})`,
        iconUrl: '../images/nuxeo-128.png',
        requireInteraction: false,
      })
      .then(() => resolve()));

    const cancelNotification = () => new Promise((resolve) => this.worker.desktopNotifier
      .cancel('reload')
      .then(() => resolve()));

    const notifyError = (cause) => new Promise((_, reject) => this.worker.desktopNotifier
      .notify('error', {
        title: 'Something went wrong...',
        message: `An error occurred (${this.serverUrl}) : ${cause.message}`,
        iconUrl: '../images/access_denied.png',
        requireInteraction: false,
      })
      .then(() => {
        const error = new Error(`Error restarting server '${cause.message}'`);
        error.cause = cause;
        return reject(error);
      }));

    return this.asPromise()
      .then(notifyRestart)
      .then(() => this.worker.tabNavigationHandler
        .updateServerTab('site/connectClient/restartView', true))
      .then(cancelNotification)
      .catch(notifyError);
  }
}

export default ServerConnector;
