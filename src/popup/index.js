/* eslint-disable no-sequences */
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

import $ from 'jquery';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import debounce from 'just-debounce';
import DOMPurify from 'dompurify';
import NuxeoServerVersion from 'nuxeo/lib/server-version';
import Swal from 'sweetalert2';

import ServiceWorkerBridge from '../service-worker-bridge';

function loadPage(worker, options = { forceForbiddenDomains: false }) {
  const startLoading = () => {
    const headingElement = $('.heading'); // Select the heading div
    const headingPosition = headingElement.position(); // Get its position
    const headingHeight = headingElement.outerHeight(); // Get its height
    const headingWidth = headingElement.outerWidth(); // Get its width

    const loadingElement = $('#loading'); // Select the loading element
    const loadingHeight = loadingElement.outerHeight(); // Get the loading element's height
    const loadingWidth = loadingElement.outerWidth(); // Get the loading element's width
    // Calculate the top position to center the loading vertically within the heading
    const topPosition = headingPosition.top + (headingHeight / 2) - (loadingHeight / 2);

    // Position the loading element to the right of the heading div with a margin
    const leftPosition = headingPosition.left + headingWidth - loadingWidth - 10;

    // Apply the calculated positions to the loading element
    loadingElement.css({
      display: 'block',
      position: 'absolute', // Ensure the loading element is positioned absolutely
      top: `${topPosition}px`,
      left: `${leftPosition}px`,
    });
  };

  const startLoadingHR = () => new Promise((resolve) => {
    const a = $('a#hot-reload-button');
    const position = a.position();
    $('#loading').css({
      display: 'block',
      top: position.top - 5,
      left: position.left - 50
    });
    resolve();
  });

  // eslint-disable-next-line no-shadow
  const stopLoading = (error) => {
    $('#logo').css('visibility', 'visible');
    $('#loading').css('display', 'none');
    if (!error) return;
    if (worker.isDevelopmentModeError(error)) return;
    const alertInfo = () => {
      let info = {
        title: 'Oops...',
        text: 'An internal error comes up while loading the popup!',
        footer: `
  Please open the JavaScript console of the <a href="chrome://extensions/">nuxeo web extension</a> for more details<br/>
  <ul>
  <li>enable the development mode</li>,
  <li>inspect the nuxeo web extension</li>.
  </ul>`,
        icon: 'error',
        showConfirmButton: false
      };
      if (!worker.isComponentError(error)) {
        // not a component request , inform user to read the log
        return info;
      }
      const jsonError = error.json();
      info = {
        ...info,
        footer: jsonError.message
      };
      const notification = jsonError.notification;
      if (notification) {
        // If there's a notification, enrich the info object
        info = {
          ...info,
          title: notification.options.title,
          text: notification.options.message,
          icon: null,
          imageUrl: notification.options.iconUrl,
          imageAlt: 'Error'
        };
        if (notification.id === 'forbidden_domain') {
          const reloadPage = () => {
            loadPage(worker, { ...options, forceForbiddenDomains: true });
          };
          info = {
            ...info,
            showCancelButton: true,
            showConfirmButton: true,
            confirmButtonText: 'Force',
            cancelButtonText: 'Close',
            preConfirm: () => reloadPage(),
            onClose: () => {
              window.close();
            }
          };
        }
      }
      return info;
    };

    // log error if not a jsonError
    if (!Object.hasOwn(error, 'jsonError')) {
      console.error('Popup loading error', error);
    }

    // advertise the user
    Swal.fire(alertInfo());
  };

  const showDependencyError = (deps) => {
    let nuxeoctlCommand = 'nuxeoctl mp-install';
    deps.forEach((dep) => {
      const li = document.createElement('li');
      li.textContent = dep;
      $('#deps-list').append(li);
      nuxeoctlCommand += ` ${dep}`;
    });
    $('div.nuxeoctl-command').append(nuxeoctlCommand);
    $('div.shade').show();
    $('div.deps-mismatch').show();
    const msgHeight =
      document.getElementsByClassName('deps-popup')[0].offsetHeight;
    const htmlHeight = $('html').height();
    if (msgHeight > 360) {
      const heightDiff = msgHeight - 360;
      $('html').css('height', htmlHeight + heightDiff);
    } else {
      $('html').css('height', 'auto');
    }
  };

  const hideDependencyError = () => new Promise((resolve) => {
    $('deps-list').empty();
    $('div.nuxeoctl-command').empty();
    $('div.shade').hide();
    $('div.deps-mismatch').hide();
    resolve();
  });

  const studioPackageFound = (developmentMode, connectUrl, packageName) => {
    $('div.studio-package-name').text(packageName);
    worker.desktopNotifier.cancel('no_studio_project');
    const toogleDesignerLivePreviewButton = (isEnabled) => {
      $('#designer-live-preview-button').toggleClass('enabled', isEnabled);
    };
    const toogleDesignerLivePreviewMessage = (cause) => {
      toogleDesignerLivePreviewButton(false);
      if (cause) {
        const message = worker.isComponentError(cause)
          ? cause.json().message
          : cause.message;
        $('#designer-livepreview-message').css('display', 'block');
        $('#designer-livepreview-message a').text(message);
        $('#designer-live-preview-button').css('filter', 'invert(1)');
      } else {
        $('#designer-livepreview-message').css('display', 'none');
        $('#designer-livepreview-message a').text('');
        $('#designer-live-preview-button').css('filter', 'invert(0)');
      }
    };
    $('#no-studio-buttons').css('display', 'none');
    $('#studio').css('display', 'flex');
    $('#studio-buttons').css('display', 'block');
    worker.designerLivePreview
      .isEnabled(packageName)
      .then((isEnabled) => toogleDesignerLivePreviewButton(isEnabled))
      .then(() => {
        $('#designer-live-preview-button').click(() => {
          worker.designerLivePreview
            .toggle(packageName)
            .then((isEnabled) => toogleDesignerLivePreviewButton(isEnabled))
            .then(() => worker.tabNavigationHandler.reloadServerTab())
            .catch((cause) => toogleDesignerLivePreviewMessage(cause));
        });
      })
      .catch((cause) => {
        toogleDesignerLivePreviewMessage(cause);
      });

    const packageLocation = new URL(
      `studio/ide?project=${packageName}`,
      connectUrl.href
    ).toString();
    $('#log-into-studio').attr('href', packageLocation.toString());
    $('#studio').click(() => {
      worker.tabNavigationHandler.loadNewExtensionTab(packageLocation);
    });
    if (!developmentMode) {
      $('#hot-reload-button').css('filter', 'invert(1)');
      $('#hot-reload-message').css('display', 'block');
    } else {
      $('#hot-reload-message').css('display', 'none');
      $('#hot-reload-message a').text('');
    }
    $('#hot-reload-button').click(() => {
      startLoadingHR()
        .then(() => worker.studioHotReloader.reload())
        .then(() => stopLoading())
        .then(() => worker.tabNavigationHandler.reloadServerTab())
        .catch((cause) => stopLoading(cause));
    });
    $('#hot-reload-message a').click(() => {
      Swal.fire({
        title: 'Info!',
        html: `You are not in development mode,<br/>
                 you can't hot-reload studio package.<br/><br/>
                 Please add the following parameters to your <code>nuxeo.conf</code> file:<br/>
                 <code>org.nuxeo.dev=true</code><br/>
                 <code>org.nuxeo.runtime.reload_strategy=standby</code>`
      });
    });

    $('#force-hot-reload-button').click(() => {
      hideDependencyError()
        .then(startLoadingHR)
        .then(() => worker.studioHotReloader.reload(false))
        .then(() => stopLoading())
        .catch((cause) => stopLoading(cause));
    });
    $('#cancel-button').click(() => {
      hideDependencyError()
        .then(() => worker.studioHotReloader.reset())
        .catch((error) => console.error(error));
    });
  };

  const noStudioPackageFound = () => {
    $('div.studio-package-name').text('<No associated Studio project>');
    $('#no-studio-buttons').hide();
    // $('div.nuxeoctl-command').append('nuxeoctl register');
    // $('div.shade').show();
    // $('#no-studio-package-registered').show();
    worker.desktopNotifier.notify('no_studio_project', {
      title: 'No associated Studio project',
      message:
        "If you'd like to use this function, please associate your Nuxeo server with a studio project",
      iconUrl: '../images/access_denied.png'
    });
  };

  const registerLink = (element, url) => {
    $(element).click(() => {
      worker.tabNavigationHandler.loadNewExtensionTab(url);
    });
  };

  const checkDependencyMismatch = () => worker.studioHotReloader
    .dependenciesMismatch()
    .then((dependenciesMismatch) => {
      if (dependenciesMismatch.length > 0) {
        showDependencyError(dependenciesMismatch);
      } else {
        hideDependencyError();
      }
    });

  const adjustStorageButtons = () => {
    $('.highlight-option').hide();
    $('#save').css('right', -15);
    $('#save').css('top', 5);
    $('#reset').css('right', -37);
    $('#reset').css('top', 5);
  };

  // reset jQuery event handlers
  $('body').find('*').addBack().off();

  Promise.resolve()
    .then(() => startLoading())
    .then(worker.serverConnector.asNuxeo(options)
      .then((nuxeo) => worker.connectLocator
        .asRegistration()
        .then((input) => {
          const { location, credentials } = input;
          const connectUrl = new URL(location);
          const connectCredentials = credentials;
          return { connectUrl, connectCredentials, ...input };
        })
      // process the page, should split this in multiple functions
      // eslint-disable-next-line no-unused-vars
        .then(({ connectUrl, connectCredentials, cookiesGranted }) => {
        // bind the fields with the js worker
          const pendingPromises = [];

          pendingPromises.push(
            worker.asDevelopmentMode()
              .then(() => {
              // set values
                $('#connect-url-input').val(connectUrl);

                $('#save').click(() => {
                  const savingPromises = [];

                  // connect URL
                  savingPromises.push(
                    Promise.resolve($('#connect-url-input'))
                      .then(
                        (inputField) => (
                          $('#connect-url').hide(),
                          { field: inputField, value: inputField.val() }
                        )
                      )
                      .then(({ field, value }) => {
                        const registration =
                      value.length !== 0
                        ? worker.connectLocator.asRegistration(value)
                        : worker.connectLocator.asRegistration();
                        return registration.then(
                          ({ location }) => (field.val(location), new URL(location))
                        );
                      })
                  );

                  // studio package name
                  savingPromises.push(
                    Promise.resolve($('#studio-package-name-input'))
                      .then((selectBox) => (selectBox.length === 0 ? undefined : selectBox.val()))
                      .then((name) => {
                        if (!name) {
                          return undefined;
                        }
                        return worker.serverConnector
                          .registerDevelopedStudioProject(name)
                          .then(() => name);
                      })
                  );

                  // highlight
                  savingPromises.push(
                    worker.browserStore
                      .set({ highlight: $('#highlight-input').prop('checked') })
                      .then((store) => store.highlight)
                  );

                  Promise.all(savingPromises).then(() => worker.componentInventory.reload());
                });

                $('#reset').click(() => {
                  Swal.fire({
                    title: 'Reset Options',
                    text: 'Click Reset to reset all options to default settings.',
                    showCancelButton: true,
                    confirmButtonText: 'Reset',
                    cancelButtonText: 'Cancel'
                  }).then((result) => {
                    if (!result.isConfirmed) return;
                    worker.componentInventory.reset();
                  });
                });
                // Grant cookies permissions to connect if needed
                // Define a variable in memory to keep track of the permission state
                // eslint-disable-next-line no-unused-vars
                let newCookiesGranted = cookiesGranted;
                const onCookiesGranted = (granted) => {
                  const style = `<i class="fas fa-lock${granted ? '-open' : ''}"/>`;
                  $('#grant').html(style);
                  newCookiesGranted = granted;
                };
                onCookiesGranted(cookiesGranted);
                $('#grant').click(() => {
                  const permissions = {
                    origins: [`${connectUrl.origin}/*`],
                    permissions: ['cookies']
                  };
                  chrome.permissions
                    .contains(permissions)
                    .then((isGranted) => (isGranted
                      ? chrome.permissions.remove(permissions)
                      : chrome.permissions.request(permissions)))
                    .then(() => chrome.permissions.contains(permissions))
                    .then((granted) => onCookiesGranted(granted))
                    .catch((error) => {
                      console.error(
                        'Error handling permissions',
                        permissions,
                        error
                      );
                      // Handle the error appropriately in your extension
                      // For example, you might want to inform the user that the permissions cannot be modified
                    });
                });
              })
              .catch(() => {})
          );

          // process the page
          const browserVendor = worker.buildInfo.browserVendor();
          if (browserVendor === 'Firefox') {
            adjustStorageButtons();
          }

          // For chrome browser, the designer live preview is enable
          // for version upper 72
          if (browserVendor === 'Chrome') {
            const version = parseInt(
              /(Firefox|Chrome)\/(?<version>[0-9\.]*)/g
                .exec(navigator.userAgent)
                .groups.version.split('.')[0]
            );
            if (version < 72) {
              $('#designer-livepreview').hide();
              $('#designer-livepreview-need-update').show();
            }
          }

          $('#nxql-clear').click(() => {
            $('#nxql-docid').val('');
          });

          worker.asDevelopmentMode()
            .then(() => {
              $('#logo').click(() => {
                $('#connect-url').toggle();
              });
            });

          // being resolved in promise for handles, better be bound in a dedicated class I think
          let onUI;
          let repository = 'default';
          let serverRuntimeInfo;
          let serverUrl;

          const regexes = {};
          regexes.uuid =
          /(?:(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})|uuid:(?<uuidAny>.*))/;
          regexes.repo = /[A-Za-z_\.0-9-]+/;
          regexes.path = /\/[A-Za-z\.0-9_\- \/%~:?#'"]+/;

          regexes.jsf = {};
          regexes.jsf.nxpath = new RegExp(
            `(?:nxpath/(?<repoPath>${regexes.repo.source})(?<path>${regexes.path.source}))`
          );
          regexes.jsf.nxdoc = new RegExp(
            `(?:nxdoc/(?<repoId>${regexes.repo.source})/(?<docid>${regexes.uuid.source}))`
          );
          regexes.jsf.doc = new RegExp(
            `/(${regexes.jsf.nxpath.source}|${regexes.jsf.nxdoc.source})`
          );

          regexes.ui = {};
          regexes.ui.home = new RegExp('(?:home$)');
          regexes.ui.browse = new RegExp('(?:browse(?<path>/.+?(?=\\?|$)))');
          regexes.ui.docid = new RegExp(
            `(?:doc/(?<docid>${regexes.uuid.source}))`
          );
          regexes.ui.doc = new RegExp(
            `/(?:repo/(?<repo>${regexes.repo.source})|)ui/#!/(?:${regexes.ui.browse.source}|${regexes.ui.docid.source}|${regexes.ui.home.source})`
          );

          function doGetJson(path) {
            worker.browserStore.get({ highlight: true }).then((res) => {
              if (res.highlight) {
                worker.documentBrowser
                  .jsonOf(repository, path)
                  .then(openJsonWindow);
              } else {
                const jsonPath = `api/v1/repo/${repository}/${path}?enrichers.document=acls,permissions&properties=*`;
                worker.tabNavigationHandler.loadNewExtensionTab(jsonPath, true);
              }
            });
          }

          function getJsonFromPath(input) {
            doGetJson(`path/${decodeURIComponent(input)}`);
          }

          function getJsonFromGuid(input) {
            doGetJson(`id/${input}`);
          }

          function hideActionsAndToggles(messageId = 'no-admin-rights') {
            $('.buttons').css('display', 'none');
            $('.toggles').css('display', 'none');
            $(`#messages > #${messageId}`).css('display', 'block');
          }

          if (!nuxeo.user.isAdministrator) {
            hideActionsAndToggles();
          }

          pendingPromises.push(
            worker.browserStore
              .get({ highlight: true })
              .then(({ highlight: isChecked }) => $('#highlight-input').prop('checked', isChecked))
          );
          pendingPromises.push(checkDependencyMismatch());

          pendingPromises.push(
            Promise.resolve($('#studio-package-name-input'))
              .then((selectBox) => (selectBox.length === 0 ? undefined : selectBox))
              .then((selectBox) => {
                if (!selectBox) {
                  return worker.serverConnector
                    .asConnectRegistration()
                    .then((registration) => {
                      const { package: studioPackage } = registration;
                      if (!studioPackage) return registration;
                      return { ...registration, package: studioPackage.name };
                    });
                }
                return Promise.all([
                  nuxeo.user.isAdministrator ? worker.serverConnector
                    .asConnectRegistration() : Promise.resolve({}),
                  nuxeo.user.isAdministrator ? worker.serverConnector
                    .asDevelopedStudioProjects() : Promise.resolve([])
                    .then((projects) => {
                    // Remove any existing options
                      while (selectBox[0].firstChild) {
                        selectBox[0].removeChild(selectBox[0].firstChild);
                      }
                      // Add an option for each studio package
                      let registeredPackageFound = null;
                      projects.forEach((project) => {
                        const option = document.createElement('option');
                        option.value = project.packageName;
                        option.text = project.packageName;
                        if (project.isRegistered) {
                          option.selected = true;
                          registeredPackageFound = project.packageName;
                        }
                        selectBox[0].appendChild(option);
                      });

                      // Return whether an enabled package was found
                      return { ...projects, package: registeredPackageFound };
                    })])
                  .then(([registration, projects]) => ({ ...registration, ...projects }));
              })
            // eslint-disable-next-line no-shadow
              .then((registration) => {
                const {
                // eslint-disable-next-line no-shadow, no-unused-vars
                  serverUrl: serverLocation,
                  connectUrl: connectLocation,
                  connectSubscription,
                  // eslint-disable-next-line no-unused-vars
                  developmentMode,
                  package: registeredPackage
                } = registration;
                if (connectSubscription && connectSubscription.errorMessage) {
                  const alertText = `
    Cannot retrieve your server registration from \`${connectUrl}\`...
    <br/>Most probably your CLID is invalid or missing !
    <br/>(see console logs for mor details)`;

                  Swal.fire({
                    title: 'Warning',
                    html: alertText,
                    icon: 'warning'
                  });
                }
                if (registeredPackage) {
                  studioPackageFound(
                    developmentMode,
                    new URL(connectLocation),
                    registeredPackage.name
                  );
                } else if (nuxeo.user.isAdministrator) {
                  noStudioPackageFound();
                }
              })
          );

          pendingPromises.push(
            worker.serverConnector
              .executeOperation('Traces.ToggleRecording', { readOnly: true })
            // eslint-disable-next-line no-sequences
              .then((json) => json.value)
              .then((value) => Boolean(value))
              .then((isEnabled) => {
                $('#traces-button').toggleClass('enabled', isEnabled);
              })
          );

          pendingPromises.push(
            worker.serverConnector.asRuntimeInfo().then((runtimeInfo) => {
              if (!runtimeInfo.nuxeo.connected) {
                return Promise.resolve();
              }
              const nuxeoServerVersion = NuxeoServerVersion.create(
                runtimeInfo.nuxeo.serverVersion.version
              );
              const lts2019 = NuxeoServerVersion.create('10.10');
              serverRuntimeInfo = runtimeInfo;
              serverUrl = runtimeInfo.serverUrl.replace(/\/$/, '');
              const serverString = DOMPurify.sanitize(serverUrl);

              const promises = [
                Promise.resolve(
                  $('#platform-version').text(
                    ` ${runtimeInfo.nuxeo.serverVersion.version}`
                  )
                ),
                nuxeoServerVersion.lt(lts2019)
                  ? worker.browserStore
                    .set({ highlight: true })
                    .then(() => adjustStorageButtons())
                  : Promise.resolve(),
                Promise.resolve($('div.server-name-url').text(serverString)),
                Promise.resolve(
                  registerLink(
                    '#automation-doc',
                    serverUrl.concat('/site/automation/doc/')
                  )
                ),
                Promise.resolve(runtimeInfo.installedAddons).then((addons) => {
                  if (!addons.includes('nuxeo-web-ui')) {
                    $('#designer-livepreview').hide();
                  }
                  const playgroundUrl = addons.includes('nuxeo-api-playground')
                    ? `${serverUrl}/playground/#/${serverUrl}`
                    : `http://nuxeo.github.io/api-playground/#/${serverUrl}`;
                  return registerLink('#api-playground', playgroundUrl);
                })
              ];

              return Promise.all(promises);
            })
          );

          pendingPromises.push(
            worker.tabNavigationHandler
              .asTabParams(undefined, true)
              .then(({ url }) => {
                const jsfMatchs = regexes.jsf.doc.exec(url);
                const uiMatchs = regexes.ui.doc.exec(url);

                function exportCurrentLink(docPathOrId) {
                  $('#export-current').css('display', 'block');
                  $('#export-current').click(() => {
                    if (docPathOrId.startsWith('/')) {
                      getJsonFromPath(docPathOrId);
                    } else {
                      getJsonFromGuid(docPathOrId);
                    }
                  });
                }

                if (jsfMatchs || uiMatchs) {
                  onUI = uiMatchs;
                  const groups = (jsfMatchs || uiMatchs).groups;
                  repository =
                  groups.repoPath || groups.repoId || groups.repo || 'default';
                  if (groups.path || groups.docid) {
                    exportCurrentLink(groups.path || groups.docid);
                  }
                }
                return url;
              })
          );

          registerLink('#nuxeo-status', 'https://status.nuxeo.com/');
          registerLink('#explorer', 'https://explorer.nuxeo.com');
          registerLink('#nxql', 'https://doc.nuxeo.com/nxdoc/nxql/');
          registerLink(
            '#el-scripting',
            'https://doc.nuxeo.com/nxdoc/understand-expression-and-scripting-languages-used-in-nuxeo/'
          );
          registerLink(
            '#mvel',
            'https://doc.nuxeo.com/nxdoc/use-of-mvel-in-automation-chains/'
          );
          registerLink(
            '#workflow-variables',
            'https://doc.nuxeo.com/nxdoc/variables-available-in-the-automation-context/'
          );
          registerLink(
            '#escalation-rules',
            'https://doc.nuxeo.com/nxdoc/escalation-service/'
          );
          registerLink(
            '#nuxeo-elements',
            'https://www.webcomponents.org/author/nuxeo'
          );
          registerLink(
            '#nuxeo-layouts',
            'http://showcase.nuxeo.com/nuxeo/layoutDemo/'
          );
          registerLink(
            '#style-guide',
            'http://showcase.nuxeo.com/nuxeo/styleGuide/'
          );

          function showSearchResults(icon, title, path, uid, vMajor, vMinor) {
            const iconLink = serverUrl.concat(icon);
            const iconTag = document.createElement('td');
            const image = document.createElement('img');
            const titleTag = document.createElement('td');
            const jsonTag = document.createElement('td');
            const jsonIcon = $('.json-icon-large').clone();
            const pathTag = document.createElement('td');
            const searchResult = document.createElement('tr');
            const searchResultPath = document.createElement('tr');
            iconTag.setAttribute('colspan', '1');
            iconTag.className = 'icon';
            image.className = 'doc-icon';
            image.setAttribute('src', `${iconLink}`);
            image.setAttribute('alt', 'icon');
            iconTag.appendChild(image);
            titleTag.setAttribute('colspan', '18');
            titleTag.setAttribute('title', 'Open document in another tab');
            titleTag.className = 'doc-title';
            titleTag.id = `${uid}`;
            if (
              typeof vMajor !== 'undefined' &&
            typeof vMinor !== 'undefined' &&
            (vMajor !== 0 || vMinor !== 0)
            ) {
              titleTag.textContent = `${title} `;
              const span = document.createElement('span');
              span.className = 'version';
              span.textContent = `v${vMajor}.${vMinor}`;
              titleTag.appendChild(span);
            } else {
              titleTag.textContent = `${title}`;
            }
            jsonTag.setAttribute('colspan', '1');
            jsonTag.className = 'icon';
            jsonIcon.removeClass('json-icon-large');
            jsonIcon.addClass('json-icon');
            jsonIcon.attr('id', `${uid}`);
            $('title', jsonIcon).text('View document JSON');
            jsonTag.appendChild(jsonIcon[0]);
            pathTag.setAttribute('colspan', '20');
            pathTag.className = 'doc-path';
            pathTag.textContent = `${path}`;
            searchResult.className = 'search-result';
            searchResult.appendChild(iconTag);
            searchResult.appendChild(titleTag);
            searchResult.appendChild(jsonTag);
            searchResultPath.appendChild(pathTag);
            $('tbody').append(searchResult);
            $('tbody').append(searchResultPath);
          }

          function docSearch(nxqlQuery, input) {
            return worker.serverConnector
              .query({ query: nxqlQuery, sortBy: 'dc:modified' })
              .then((res) => {
                if (res.entries.length > 0) {
                  $('.no-result').css('display', 'none');
                  $('body').css('overflow-y', 'auto');
                  const thead = document.createElement('thead');
                  const tr = document.createElement('tr');
                  const th = document.createElement('th');
                  const tbody = document.createElement('tbody');
                  th.setAttribute('colspan', '20');
                  th.textContent = 'Search Results:';
                  tr.appendChild(th);
                  thead.appendChild(tr);
                  $('#search-results').append(thead);
                  $('#search-results').append(tbody);
                  $('table').css('margin-top', '20px');
                  res.entries.forEach((doc) => {
                    $('html').outerHeight($('html').height());
                    const icon = doc.properties['common:icon'];
                    const title = doc.properties['dc:title'];
                    const re = /^(.*[\/])/;
                    const path = re.exec(doc.path)[1];
                    const uid = doc.uid;
                    const vMajor = doc.properties['uid:major_version'];
                    const vMinor = doc.properties['uid:minor_version'];
                    showSearchResults(icon, title, path, uid, vMajor, vMinor);
                  });
                  $('.doc-title').click((event) => {
                    const docPath = onUI
                      ? `ui/#!/doc/${event.currentTarget.id}`
                      : `nxdoc/default/${event.currentTarget.id}/view_documents`;
                    worker.tabNavigationHandler.loadNewExtensionTab(docPath, true);
                  });
                  $('.json-icon').click((event) => {
                    event.preventDefault();
                    getJsonFromGuid(event.currentTarget.id);
                  });
                } else {
                  const searchTerm = DOMPurify.sanitize(input);
                  $('.no-result span').text(searchTerm);
                  $('.no-result').css('display', 'block');
                }
                $('#loading-gif').css('display', 'none');
                $('#search').css('text-indent', '5px');
              })
              .catch((error) => {
                console.error(error);
                error.response.json().then((json) => {
                  worker.desktopNotifier.notify(
                    'error',
                    json.code,
                    json.message,
                    '../images/access_denied.png'
                  );
                  $('#loading-gif').css('display', 'none');
                  $('#search').css('text-indent', '5px');
                });
              });
          }

          let openJsonWindow = (jsonObject) => {
            const jsonString = JSON.stringify(jsonObject, undefined, 2);
            return worker.jsonHighlighter
              .input(DOMPurify.sanitize(jsonString))
              .then(() => worker.tabNavigationHandler.loadNewExtensionTab('json/index.html'));
          };

          $('#restart-button').on('click', () => {
          // Function to show confirmation dialog
            const confirmRestart = () => Swal.fire({
              title: 'Warning!',
              text: `You have administrator privileges but the server is not in development mode.
                 Are you sure you want to restart the server now ?`,
              showCancelButton: true,
              confirmButtonText: 'Restart',
              cancelButtonText: 'Cancel'
            });

            // Main perform function
            const performRestart = () => worker.serverConnector
              .restart()
              .then(() => window.close());

            // Decision logic for restart
            if (!serverRuntimeInfo.connectRegistration.developmentMode) {
              confirmRestart().then((result) => {
                if (result.isConfirmed) {
                  performRestart();
                }
              });
            } else {
              performRestart();
            }
          });

          const navigateLink = (event) => {
            event.preventDefault();
            const linkHref = $(event.currentTarget).attr('href');

            return fetch(chrome.runtime.getURL(linkHref))
              .then((response) => {
                if (!response.ok) {
                  throw new Error('Network response was not ok');
                }
                return response.text();
              })
              .then((html) => {
                $('body').html(html);
              // If the loaded page has its own scripts, you might need to reinitialize them here
              })
              .catch((error) => {
                console.error('Error loading page:', error);
              });
          };
          $('#reindex-es-button').on('click', navigateLink);
          // eslint-disable-next-line prefer-arrow-callback
          $(document).on('click', '#back', function (event) {
            navigateLink(event).then(() => loadPage(worker));
          });

          // Handle click events for the radio buttons
          $(document).on('click', '#reindex-buttons .btn', function () {
            // Toggle 'active' class for the clicked button and remove from the other
            $(this).addClass('active').siblings('.btn').removeClass('active');

            // Show or hide the form based on which button is active
            if ($('#reindex-repo').hasClass('active')) {
              $('#reindex-form').hide();
            } else {
              $('#reindex-form').show();
            }
          });

          // Handle click event for the 'reindex' button
          $(document).on('click', '#reindex', () => {
            const reindex = () => {
              if ($('#reindex-repo').hasClass('active')) {
                worker.repositoryIndexer.reindex();
              } else {
                $('#reindex-form').show();
                const input = $('#reindex-input').val();
                $('#reindex-input').val('');
                worker.repositoryIndexer.reindex(input);
              }
              window.close();
            };
            if (serverRuntimeInfo.connectRegistration.developmentMode) {
              reindex();
            } else {
              Swal.fire({
                title: 'Warning!',
                text: 'You are not in development development mode, are you sure you want to re-index the server?',
                showCancelButton: true,
                confirmButtonText: 'Re-index',
                cancelButtonText: 'Cancel'
              }).then((result) => {
                if (!result.isConfirmed) {
                  return;
                }
                reindex();
              });
            }
          });

          $('#nxql-docid').keydown((e) => {
            if (e.which === 13) {
              e.preventDefault();
              $('#reindex-nxql-doc').click();
            }
          });

          $('#traces-button').click(() => worker.serverConnector
            .executeOperation('Traces.ToggleRecording', { readOnly: false })
            .then((response) => response.value)
            .then((value) => Boolean(value))
            .then((isEnabled) => {
              $('#traces-button').toggleClass('enabled', isEnabled);
            })
            .catch((cause) => {
              console.error("Can't toggle automation traces", cause);
              return worker.serverConnector
                .executeOperation('Traces.ToggleRecording', { readOnly: true })
                .then((response) => response.value)
                .then((value) => Boolean(value))
                .catch(() => false);
            }));

          $('#search').keydown((event) => {
            $('#loading-gif').css({ display: 'inline' });
            $('#search').css('text-indent', '23px');
            if (event.keyCode === 13) {
            // prevent submit on enter
              event.preventDefault();
            }
          });

          $('#search').keyup(
            debounce(() => {
              $('#search-results').empty();
              const pathPattern = /^\//;
              const input = $('#search').val();
              if (input === '') {
                $('.no-result').css('display', 'none');
                $('#search-results').empty();
                $('#loading-gif').css('display', 'none');
                $('#search').css('text-indent', '5px');
                $('body').css('overflow-y', 'hidden');
                $('html').css('height', 'auto');
              } else if (pathPattern.test(input)) {
                getJsonFromPath(input);
                $('#loading-gif').css('display', 'none');
                $('#search').css('text-indent', '5px');
              } else if (regexes.uuid.test(input)) {
                const match = regexes.uuid.exec(input);
                const uuid = match.groups.uuid || match.groups.uuidAny;
                getJsonFromGuid(uuid);
                $('#loading-gif').css('display', 'none');
                $('#search').css('text-indent', '5px');
              } else if (
                input.toUpperCase().indexOf('SELECT ') !== -1 &&
              input.toUpperCase().indexOf(' FROM ') !== -1
              ) {
                const query = input.replace(/'/g, '"');
                docSearch(query, input);
                $('#loading-gif').css('display', 'none');
                $('#search').css('text-indent', '5px');
              } else {
                let searchTerm = input;
                if (searchTerm.indexOf('_') > -1) {
                  searchTerm = searchTerm.replace(/_/g, '&UNDERSCORE');
                }
                if (searchTerm.indexOf('\\') > -1) {
                  searchTerm = searchTerm.replace('\\', '&BACKSLASH');
                }
                if (searchTerm.indexOf('"') > -1) {
                  searchTerm = searchTerm.replace('"', '\\"');
                }
                if (searchTerm.indexOf("'") > -1) {
                  searchTerm = searchTerm.replace("'", "\\'");
                }
                const jsonQuery = `SELECT * FROM Document WHERE ecm:fulltext = "${searchTerm}"`;
                docSearch(jsonQuery, input);
                $('#loading-gif').css('display', 'none');
                $('#search').css('text-indent', '5px');
              }
            }, 1000)
          );

          function konamiCanada(cb) {
            let input = '';
            const key = '38384040373937396665';
            document.addEventListener('keydown', (e) => {
              input += `${e.keyCode}`;
              if (input === key) {
                cb();
                return;
              }
              if (!key.indexOf(input)) return;
              input = `${e.keyCode}`;
            });
          }

          function canada() {
            $('#logo').css('background-image', 'url("../images/icon.png")');
            $('a.button:hover').css('background', '#910B0B');
            $('#search-term').css('color', '#FE0000');
            $('body').css('color', '#FE0000');
            $('body').css('background-color', '#fff');
            $('.server-name').css('color', '#FE0000');
            $('a.button').css('background', '#FE0000');
            $('.useful-links').css('color', '#FE0000');
            $('.useful-link').css('color', '#FE0000');
            $('.nav-link').css('color', '#FE0000');
            $('#search').attr(
              'placeholder',
              'Sorry, please enter a search term, eh?'
            );
            $('::-webkit-input-placeholder').css('color', '#FE0000');
            $('#about').text('About');
          }

          function k() {
            $('#k').css('display', 'block');
            setInterval(() => {
              const imgUrl = $('#k').css('background-image');
              console.log(imgUrl.indexOf('1_'));
              if (imgUrl.indexOf('1_') === -1) {
                $('#k').css('background-image', 'url("../images/1_.png")');
              } else {
                $('#k').css('background-image', 'url("../images/1.png")');
              }
            }, 200);
            setTimeout(() => {
              $('#k').animate({ left: '-150%' }, 500);
              setTimeout(() => {
                canada();
              }, 500);
            }, 2500);
          }

          konamiCanada(() => {
            k();
            console.log('O Canada!');
          });
          return Promise.all(pendingPromises)
            .then(() => worker)
            .finally(() => {
              stopLoading();
            });
        }))
      .catch((cause) => stopLoading(cause)))
    .catch((cause) => stopLoading(cause));
}

document.addEventListener('DOMContentLoaded', () => {
  const worker = new ServiceWorkerBridge();
  worker
    .bootstrap({ name: 'popup', entrypoint: loadPage })
    .catch((error) => console.error(error));
});
