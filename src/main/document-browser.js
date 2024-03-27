/* eslint-disable comma-dangle */
import DOMPurify from 'dompurify';
import ServiceWorkerComponent from './service-worker-component';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pathPattern = /^\//;
const selectFromPattern = /SELECT .* FROM /i;
const webuiPattern = /nuxeo\/ui\/#!\//;

class DocumentBrowser extends ServiceWorkerComponent {
  constructor(worker) {
    super(worker);

    // Bind methods
    Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter((prop) => typeof this[prop] === 'function' && prop !== 'constructor')
      .forEach((method) => {
        this[method] = this[method].bind(this);
      });
  }

  // eslint-disable-next-line no-unused-vars
  activate(self) {
    return Promise
      .resolve([])
      .then((undoStack) => {
        chrome.omnibox.onInputEntered.addListener(this.openDocument);
        undoStack.push(() => chrome.omnibox.onInputEntered.removeListener(this.openDocument));

        chrome.omnibox.onInputChanged.addListener(this.suggestDocument);
        undoStack.push(() => chrome.omnibox.onInputChanged.removeListener(this.suggestDocument));

        return undoStack;
      })
      .then((undoStack) => () => undoStack.forEach((undo) => undo()));
  }

  onWebUI() {
    return Promise.resolve(
      webuiPattern.exec(this.worker.serverConnector._nuxeo._baseURL)
    );
  }

  openDocument(input) {
    return Promise.resolve(input)
      .then((text) => {
        if (!uuidPattern.test(input)) {
          return { text, promise: null };
        }
        return { text, promise: this.openDoc(text) };
      })
      .then(({ text, promise }) => {
        if (promise !== null) {
          return { text, promise };
        }
        if (!pathPattern.test(input)) {
          return { text, promise: null };
        }
        return { text, promise: this.openDoc(text) };
      })
      .then(({ text, promise }) => {
        if (promise == null) {
          return Promise.reject(new Error(`Invalid input ${text}`));
        }
        return promise;
      });
  }

  openDocFromId(id) {
    return this.worker.serverConnector.asNuxeo()
      .then((nuxeo) => nuxeo.request(`/id/${id}`))
      .then((request) => this.doOpenDoc(request));
  }

  openDocFromPath(path) {
    return this.worker.serverConnector.asNuxeo()
      .then((nuxeo) => nuxeo.request(`/path/${path}`))
      .then((request) => this.doOpenDoc(request));
  }

  doOpenDoc(request) {
    return request
      .schemas('*')
      .enrichers({ document: ['acls', 'permissions'] })
      .get()
      .then((doc) => {
        function pathOf(uid) {
          if (this.onWebUI()) {
            return `ui/#!/doc/${uid}`;
          }
          return `nxdoc/default/${uid}/view_documents`;
        }
        this.tabNavigationHandler.loadNewExtensionTab(pathOf(doc.uid), true);
      })
      .catch((error) => {
        console.log(error);
      });
  }

  suggestDocument(input, suggest) {
    return Promise.resolve({ text: input, pronise: null })
      .then(({ text, promise }) => {
        if (promise || !uuidPattern.test(text)) {
          return { text, promise };
        }
        // document selection using UUID
        return { text, promise: this.openDocFromId(text) };
      })
      .then(({ text, promise }) => {
        if (promise || !pathPattern.test(text)) {
          return { text, promise };
        }
        // document selection using path
        return { text, promise: this.openDocFromPath(text) };
      })
      .then(({ text, promise }) => {
        if (promise) {
          return promise;
        }
        // document selection using NXQL
        const jsonQueryOf = (query) => {
          if (selectFromPattern.test(query)) {
            return text;
          }
          return `SELECT * FROM Document WHERE ecm:fulltext = "${text}"`;
        };
        const query = jsonQueryOf(text).replace(/'/g, '"');
        const suggestions = [];
        return this.nuxeo
          .repository()
          .schemas(['dublincore', 'common', 'uid'])
          .query({
            query,
            sortBy: 'dc:modified',
          })
          .then((res) => {
            if (res.entries.length > 0) {
              res.entries.forEach((doc) => {
                const sanitizedDoc = DOMPurify.sanitize(
                  `<match>${doc.title}</match> <dim>${doc.path}</dim>`,
                  { ALLOWED_TAGS: ['match', 'dim'] }
                );
                suggestions.push({
                  content: doc.uid,
                  description: sanitizedDoc,
                });
              });
            }
            if (res.entries.length > 5) {
              const sanitizedDoc = DOMPurify.sanitize(
                '<dim>Want more results? Try the</dim> <match>fulltext searchbox</match> <dim>from the Nuxeo Dev Tools extension window.</dim>',
                { ALLOWED_TAGS: ['match', 'dim'] }
              );
              chrome.omnibox.setDefaultSuggestion({
                description: sanitizedDoc,
              });
            }
            suggest(suggestions);
          });
      });
  }

  jsonOf(repository, path) {
    return this.worker.serverConnector.asNuxeo()
      .then((nuxeo) => nuxeo
        .request(`/repo/${repository}/${path}`)
        .schemas('*')
        .enrichers({ document: ['acls', 'permissions'] })
        .get({ resolveWithFullResponse: true })
        .then((result) => result.json()));
  }
}

export default DocumentBrowser;
