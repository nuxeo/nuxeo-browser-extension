/* eslint-disable no-return-assign */
/* eslint-disable no-sequences */
/* eslint-disable comma-dangle */
import ServiceWorkerComponent from './service-worker-component';

class TabNavigationHandler extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    // Define properties
    this.tabInfo = null;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });

    // ...
    this.nuxeoUrlOf = (tabInfo) => {
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
      const matchGroups = nxPattern.exec(tabInfo.url);
      const isMatching = Boolean(matchGroups && matchGroups[2]);
      const [, extractedLocation] = isMatching ? matchGroups : [];

      return isMatching ? new URL(extractedLocation) : undefined;
    };
  }

  isTabExtensionEnabled() {
    return this.tabInfo !== null;
  }

  enableTabExtension(input) {
    return Promise.resolve(input)
      .then((tabInfo) => (this.tabInfo = tabInfo, tabInfo))
      .then((tabInfo) => Promise.resolve(tabInfo.id)
        .then((tabId) => (chrome.action.enable(tabId), tabId))
        .then((tabId) => (chrome.action.setBadgeText({ tabId, text: '' }), tabId))
        .then(() => tabInfo));
  }

  disableTabExtension(input = this.tabInfo) {
    return Promise.resolve(input)
      .then((tabInfo) => (this.tabInfo = null, tabInfo))
      .then((tabInfo) => Promise.resolve(tabInfo.id)
        .then((tabId) => (chrome.action.disable(tabId), tabId))
        .then((tabId) => (chrome.action.setBadgeText({ tabId, text: 'D' }), tabId))
        .then((tabId) => (chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF7F7F' }), tabId))
        .then(() => tabInfo));
  }

  // eslint-disable-next-line no-unused-vars
  activate(self) {
    // disable extension by default
    chrome.action.disable();

    return Promise.resolve([])
      .then((undoStack) => {
        // tab activation handle
        const tabActivatedHandle = (activeInfo) => chrome
          .tabs.get(activeInfo.tabId, (tabInfo) => this
            .enableExtensionIfNuxeoServerTab(tabInfo));
        chrome.tabs.onActivated.addListener(tabActivatedHandle);
        undoStack.push(() => chrome.tabs.onActivated.removeListener(tabActivatedHandle));
        return undoStack;
      })
      .then((undoStack) => {
        // tab update handle
        const tabUpdatedHandle = (tabId, changeInfo, tabInfo) => {
          if (changeInfo.status !== 'complete') return;

          this.enableExtensionIfNuxeoServerTab(tabInfo);
        };
        chrome.tabs.onUpdated.addListener(tabUpdatedHandle);
        undoStack.push(() => chrome.tabs.onUpdated.removeListener(tabUpdatedHandle));
        return undoStack;
      })
      .then((undoStack) => {
        // windows focus handle
        const windowFocusHandle = (windowId) => {
          if (windowId === chrome.windows.WINDOW_ID_NONE) return;
          chrome.tabs.query({ active: true, windowId }, (tabs) => {
            if (!tabs || tabs.length === 0) return;

            this.enableExtensionIfNuxeoServerTab(tabs[0]);
          });
        };
        chrome.windows.onFocusChanged.addListener(windowFocusHandle);
        undoStack.push(() => chrome.windows.onFocusChanged.removeListener(windowFocusHandle));
        return undoStack;
      })
      .then((undoStack) => {
        // tab removed handle
        // eslint-disable-next-line no-unused-vars
        const tabRemovedHandle = (tabId, removeInfo) => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || tabs.length === 0) return;

            this.enableExtensionIfNuxeoServerTab(tabs[0]);
          });
        };
        chrome.tabs.onRemoved.addListener(tabRemovedHandle);
        undoStack.push(() => chrome.tabs.onRemoved.removeListener(tabRemovedHandle));
        return undoStack;
      })
      .then((undoStack) => () => undoStack.forEach((cleanup) => cleanup()));
  }

  enableExtensionIfNuxeoServerTab(tabInfo) {
    return this.worker.developmentMode.asConsole()
      .then((console) => this
        .asServerUrl(tabInfo)
        .then((serverUrl) => {
          console.log('Handling tab activation', tabInfo);
          return Promise.resolve()
            .then(() => this.worker.serverConnector.onNewLocation(serverUrl))
            .then(() => (serverUrl ? this.worker.cookieManager.enable() : this.worker.cookieManager.disable()))
            .then(() => (serverUrl ? this.enableTabExtension(tabInfo) : this.disableTabExtension(tabInfo)))
            .then(() => chrome.action.isEnabled(tabInfo.id)
              .then((isEnabled) => console
                .log(`Handled tab activation <- serverUrl=${serverUrl}, extension=${isEnabled ? 'enabled' : 'disabled'}`, tabInfo)))
            .then(() => serverUrl);
        })
        .catch((cause) => {
          if (!cause.isForbidden) {
            console.error('Handled tab activation <- caught error', tabInfo, cause);
          }
          return Promise.reject(cause);
        })
        .finally(() => console.log('Handled tab activation <- done', tabInfo)));
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
            return this.reloadServerTab({ rootUrl: nuxeoUrl, tabInfo });
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

  reloadServerTab(context = {
    rootUrl: this.worker.serverConnector.serverUrl,
    tabInfo: this.tabInfo
  }, maxAttempts = 1, waitingTime = 4000, hasReloaded = false) {
    return Promise.resolve(context)
      .then(({ rootUrl, tabInfo }) => {
        if (!tabInfo) {
          throw new Error('No nuxeo server tab info selected');
        }
        return { rootUrl, tabInfo };
      }).then(({ rootUrl }) => {
        const runningStatusUrl = `${rootUrl}/runningstatus`;
        let attempts = 0;
        const checkStatus = () => {
          attempts += 1;
          if (attempts > maxAttempts) {
            throw new Error(`Maximum number of attempts reached on ${rootUrl}...`);
          }
          return fetch(runningStatusUrl)
            .then((response) => {
              if (!response.ok) {
              // If the status page is not available, check again after a delay
                return new Promise((resolve) => setTimeout(resolve, waitingTime))
                  .then(checkStatus);
              }
              // Reload the tab only if it has not been reloaded yet
              if (!hasReloaded) {
              // chrome.tabs.reload(tabInfo.id);
                hasReloaded = true; // Update the flag to prevent further reloads
              }
              return response;
            })
            .catch(() => new Promise((resolve) => setTimeout(resolve, waitingTime))
              .then(checkStatus));
        };
        // Start checking the status
        return checkStatus();
      });
  }

  updateServerTab(inputUrl, appendNuxeBasePath = false) {
    return this.asTabParams(inputUrl, appendNuxeBasePath)
      .then((tabParams) => chrome.tabs.update(tabParams.openerTabId, {
        url: tabParams.url,
        selected: true
      }));
  }

  loadNewExtensionTab(inputUrl, appendNuxeBasePath = false) {
    return this.asTabParams(inputUrl, appendNuxeBasePath)
      .then((tabParams) => chrome.tabs.create({
        url: tabParams.url,
        openerTabId: tabParams.openerTabId,
        selected: false
      }));
  }

  asTabParams(inputUrl = this.tabInfo.url, appendNuxeBasePath = false) {
    return this.asPromise()
      .then((self) => ({
        url: inputUrl,
        openerTabId: self.tabInfo.id
      }))
      .then(({ url, openerTabId }) => {
        if (!appendNuxeBasePath) return { url, openerTabId };
        return this.worker.serverConnector.asPromise()
          .then((serverConnector) => ({
            url: `${serverConnector.serverUrl}/${url}`,
            openerTabId
          }));
      });
  }
}

export default TabNavigationHandler;
