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

import ServiceWorkerComponent from './service-worker-component';

class RepositoryIndexer extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    this.waiting = undefined;

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  reindex(input = undefined) {
    return this.worker.serverConnector
      .executeOperation('Elasticsearch.Index', {}, input)
      .then(() => {
        this.worker.desktopNotifier.notify('repository-reindexing', {
          title: 'Indexing!',
          message: `Your repository index is rebuilding (${input ? JSON.stringify(input) : 'all documents'}).`,
          iconUrl: '../images/nuxeo-128.png',
        });
      })
      .then(() => {
        this.waiting = this.waitForIndexing();
        return true;
      })
      .catch((cause) => {
        this.worker.desktopNotifier.notify('repository-reindexing', {
          title: 'Something went wrong...',
          message: `${cause.message}\nPlease try again later.`,
          iconUrl: '../images/access_denied.png',
        });
        return false;
      });
  }

  waitForIndexing() {
    if (this.waiting) return this.waiting;
    this.waiting = this.worker.serverConnector
      .executeOperation('Elasticsearch.WaitForIndexing')
      // eslint-disable-next-line arrow-body-style, no-unused-vars
      .then((response) => {
        return this.worker.desktopNotifier.cancel('repository-reindexing');
      })
      .then(() => { this.waiting = undefined; })
      .catch((cause) => {
        this.worker.desktopNotifier.notify('repository-reindexing', {
          title: 'Something went wrong...',
          message: `${cause.message}\nPlease try again later.`,
          iconUrl: '../images/access_denied.png',
        });
      });
    return this.waiting;
  }
}

export default RepositoryIndexer;
