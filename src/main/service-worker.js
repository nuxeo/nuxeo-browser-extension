/* eslint-disable max-classes-per-file */
/* eslint-disable comma-dangle */
import TabNavigationHandler from './tab-navigation-handler';
import BrowserStore from './browser-store';
import ConnectLocator from './connect-locator';
import CookieManager from './cookie-manager';
import DeclararactiveNetCompoments from './declarative-net-engine';
import DesignerLivePreview from './designer-live-preview';
import DesktopNotifier from './desktop-notifier';
import DocumentBrowser from './document-browser';
import JSONHighlighter from './json-highlighter';
import RepositoryIndexer from './repository-indexer';
import RuntimeBuildComponent from './runtime-build-info';
import ServerConnector from './server-connector';
import ServiceWorkerComponent from './service-worker-component';
import StudioHotReloader from './studio-hot-reloader';

const DeclarativeNetEngine = DeclararactiveNetCompoments.DeclarativeNetEngine;

class ServiceWorkerMessageHandler extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  handle(request, sender, sendResponse) {
    if (request.extension !== 'nuxeo-web-extension') {
      return undefined;
    }

    const withConnectedWorker = (worker) => {
      if (worker.serverConnector.isConnected()) {
        // If the worker already connected, return a promise that resolves immediately
        return Promise.resolve(worker);
      }
      // If the worker isn't connected, return a promise that rejects
      return Promise.reject(new Error('Worker not connected'));
    };

    const handleRequest = (worker) => {
      function getNestedProperty(obj, path) {
        return path.split('.').reduce((prev, curr) => (prev ? prev[curr] : null), obj);
      }
      const component = getNestedProperty(worker, request.component);
      if (!component) {
        return Promise.reject(new Error(`Invalid component ${JSON.stringify(request)}`));
      }
      if (typeof component[request.action] !== 'function') {
        return Promise.reject(new Error(`Invalid action ${JSON.stringify(request)}`));
      }
      this.worker.developmentMode
        .asConsole()
        .then((console) => console
          .log(`ServiceWorkerMessageHandler.handle(${JSON.stringify(request)}) called`));
      return component.asPromise()
        .then((componentInstance) => componentInstance[request.action](...request.params))
        .then((response) => this.worker.developmentMode
          .asConsole()
          .then((console) => console
            .log(`${JSON.stringify(response)} <- ServiceWorkerMessageHandler.handle(${JSON.stringify(request)})`))
          .then(() => response))
        .catch((cause) => {
          const response = { error: { message: cause.message, stack: cause.stack, response: cause.response } };
          this.worker.developmentMode
            .asConsole()
            .then((console) => console
              .log(`${JSON.stringify(response)} <- ServiceWorkerMessageHandler.handle(${JSON.stringify(request)})`, cause.stack));
          return response;
        });
    };

    withConnectedWorker(this.worker)
      .then(handleRequest)
      .then(sendResponse)
      .catch((error) => console.error(`Caught error while handling ${JSON.stringify(request)}: ${error}`));

    return true; // This is necessary to indicate that you will send a response asynchronously
  }
}

class ServiceWorkerComponentInventory extends ServiceWorkerComponent {
  list(recursive = false) {
    const componentNames = this.componentNamesOf(this.worker, recursive);
    return Promise.resolve(componentNames);
  }
}

class ServiceWorker extends ServiceWorkerComponent {
  constructor(developmentMode, buildTime, buildVersion, browserVendor) {
    super();
    // sub-componments takes reference to the worker
    // in order to invoke other services. The order is important as
    // services may be invoked while constructing.
    this.buildInfo = new RuntimeBuildComponent
      .RuntimeBuildInfo(this, buildTime, buildVersion, browserVendor);
    this.browserStore = new BrowserStore(this);
    this.cookieManager = new CookieManager(this);
    this.componentInventory = new ServiceWorkerComponentInventory(this);
    this.connectLocator = new ConnectLocator(this);
    this.declarativeNetEngine = new DeclarativeNetEngine(this);
    this.designerLivePreview = new DesignerLivePreview(this);
    this.desktopNotifier = new DesktopNotifier(this);
    this.developmentMode = new RuntimeBuildComponent.DevelopmentMode(this, developmentMode);
    this.documentBrowser = new DocumentBrowser(this);
    this.jsonHighlighter = new JSONHighlighter(this);
    this.repositoryIndexer = new RepositoryIndexer(this);
    this.serverConnector = new ServerConnector(this);
    this.studioHotReloader = new StudioHotReloader(this);
    this.tabNavigationHandler = new TabNavigationHandler(this);

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  asPromise() {
    return Promise.resolve(this);
  }

  activate(self) {
    return this.asPromise()
      .then((worker) => {
        // Initialize the cleanup stack
        const deactivateStack = [];
        if (typeof deactivateStack.push !== 'function') {
          throw new Error('cleanupFunctions must have a push method');
        }

        worker.self = self;

        // reset declative net rules previously installed
        worker.declarativeNetEngine.reset();

        // install the service worker message handler
        const messageHandle = new ServiceWorkerMessageHandler(worker).handle;
        chrome.runtime.onMessage.addListener(messageHandle);
        deactivateStack.push(() => chrome.runtime.onMessage.removeListener(messageHandle));

        // activate all sub-components
        this.componentsOf(worker)
          .map((component) => {
            if (typeof component.activate !== 'function') return () => {};
            return component
              .activate(self)
              .then((cleanup) => worker.developmentMode.asConsole()
                .then((console) => console
                  .log(`ServiceWorkerComponent.activate(${component.constructor.name}) called`))
                .then(() => cleanup));
          })
          .filter((cleanup) => typeof cleanup === 'function')
          .forEach((cleanup) => {
            deactivateStack.push(cleanup);
          });

        // can be used in development mode from the console for now
        self.nuxeoWebExtension = worker;

        return {
          worker,
          undo: () => {
            self['nuxeo-web-extension'] = undefined;
            while (deactivateStack.length > 0) {
              const deactivate = deactivateStack.pop();
              deactivate(self);
            }
          }
        };
      })
      // eslint-disable-next-line no-return-assign
      .then(({ worker, undo }) => (
        worker.deactivate = undo.bind(worker)
      ));
  }
}

export default ServiceWorker;
