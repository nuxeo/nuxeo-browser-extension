/* eslint-disable comma-dangle */
/*
Copyright 2016-2024 Nuxeo

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import NuxeoServerVersion from 'nuxeo/lib/server-version';
import ServiceWorkerComponent from './service-worker-component';

class StudioHotReloader extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  dependenciesMismatch(info = []) {
    return this.worker.browserStore
      .get({ studioDependenciesMismatch: info })
      .then((store) => store.studioDependenciesMismatch);
  }

  reset() {
    return this.browserStore.set({ studioDependenciesMismatch: [] });
  }

  reload(validate = true) {
    return this.worker.serverConnector
      .executeOperation('Service.HotReloadStudioSnapshot', { validate })
      .then((response) => ({ response: response[0], notification: null }))
      .then(({ response, notification }) => {
        if (response.status !== 'success') return { response, notification };
        return {
          response,
          notification: {
            title: 'Success!',
            message: response.message,
            iconUrl: '../images/nuxeo-128.png',
          }
        };
      })
      .then(({ response, notification }) => {
        if (response.status !== 204) return { response, notification };
        return {
          response,
          notification: {
            title: 'Success!',
            message: 'A Hot Reload has successfully been completed.',
            iconUrl: '../images/nuxeo-128.png',
          }
        };
      })
      .then(({ response, notification }) => {
        if (response.status !== 'error') return { response, notification };
        return {
          response,
          notification: {
            title: 'Error',
            message: response.message,
            iconUrl: '../images/access_denied.png',
          }
        };
      })
      .then(({ response, notification }) => {
        if (response.status !== 'updateInProgress') return { response, notification };
        return {
          response,
          notification: {
            title: 'Error',
            message: response.message,
            iconUrl: '../images/access_denied.png',
          }
        };
      })
      .then(({ response, notification }) => {
        if (response.status !== 'DEPENDENCY_MISMATCH') return { response, notification, dependenciesMismatch: [] };
        return {
          response,
          notification: {
            title: 'Dependency Mismatch',
            message: response.message,
            iconUrl: '../images/access_denied.png',
          },
          dependenciesMismatch: response.deps
        };
      })
      .then(({ response, notification, dependenciesMismatch }) => this.worker.browserStore
        .set({ studioDependenciesMismatch: dependenciesMismatch })
        .then((store) => this.worker.desktopNotifier
          .notify('hot_reload', notification)
          .then(() => ({ response, dependenciesMismatch: store.studioDependenciesMismatch }))))
      .catch((error) => this.handleLegacyErrors(error));
  }

  handleLegacyErrors(error) {
    return this.worker.serverConnector
      .asRuntimeInfo()
      .then(({ nuxeo, connectRegistration }) => {
        if (!connectRegistration) {
          const notification = {
            id: 'studio-not-registered',
            options: {
              title: 'Studio Project Not Registered',
              message: 'Cannot retrieve registered studio project while reloading studio.',
              iconUrl: '../images/access_denied.png',
            }
          };
          return this.worker.serverConnector.handleErrors(error, notification);
        }
        const { package: registeredStudioPackage } = connectRegistration || { package: 'unknown' };
        const nuxeoServerVersion = NuxeoServerVersion.create(nuxeo.version);
        const nuxeoLegacyVersion = NuxeoServerVersion.create('9.2');
        if (!nuxeoServerVersion.lte(nuxeoLegacyVersion)) throw error;
        // Error handling for Nuxeo 9.2 and older

        let dependencyErrorNotification = null;
        if (connectRegistration.nx !== registeredStudioPackage.studioDistrib[0]) {
          const message = `${registeredStudioPackage.name} - ${registeredStudioPackage.studioDistrib[0]} cannot be installed on Nuxeo ${nuxeo.version}.`;
          dependencyErrorNotification = {
            id: 'dependencies-ismatch',
            options: {
              title: 'Dependency Mismatch',
              message,
              iconUrl: '../images/access_denied.png',
              interaction: true,
            }
          };
        }
        if (!connectRegistration.match && registeredStudioPackage.deps.length > 0) {
          const deps = registeredStudioPackage.deps;
          const items = [];
          deps.forEach((dep) => {
            items.push({ title: '', message: dep.name });
          });
          dependencyErrorNotification = {
            id: 'dependency-check',
            options: {
              type: 'list',
              title: 'Check Dependencies',
              message: 'Please check that the following dependencies are installed:',
              items,
              iconUrl: '../images/access_denied.png',
              requireInteraction: true,
            }
          };
        }
        if (dependencyErrorNotification) {
          return this
            .worker
            .serverConnector
            .handleErrors(error, dependencyErrorNotification);
        }
        return this
          .worker
          .serverConnector
          .executeOperation('Service.HotReloadStudioSnapshot')
          .then(() => {
            this.worker.desktopNotifier.notify('hot-reload', {
              title: 'Success!',
              message: 'A Hot Reload has successfully been completed.',
              iconUrl: '../images/nuxeo-128.png',
            });
            return this.worker.tabNavigationHandler.reloadServerTab();
          })
          .catch((er) => {
            this
              .worker
              .serverConnector
              .handleErrors(er);
          });
      }); // End of executeScript callback
  } // End of the reloadLegacy method
}

export default StudioHotReloader;
