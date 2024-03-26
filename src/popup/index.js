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
import debounce from 'just-debounce';
import DOMPurify from 'dompurify';
import NuxeoServerVersion from 'nuxeo/lib/server-version';
import Swal from 'sweetalert2';

import ServiceWorkerBridge from '../service-worker-bridge';

function loadPage(worker) {
  let position;

  const startLoadingHR = () => new Promise((resolve) => {
    const a = $('a#hot-reload-button');
    position = a.position();
    $('#loading').css({
      display: 'block',
      top: position.top - 5,
      left: position.left - 50,
    });
    resolve();
  });

  const startLoadingRS = () => new Promise((resolve) => {
    const a = $('a#restart-button');
    position = a.position();
    $('#loading').css({
      display: 'block',
      top: position.top - 5,
      left: position.left - 50,
    });
    resolve();
  });

  const stopLoading = (cause) => {
    $('#loading').css('display', 'none');
    if (cause instanceof Error) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: `Something went wrong while loading! (${cause})`,
        footer: '<a href>Why do I have this issue?</a>'
      });
    }
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
    $('div.deps-popup').show();
    const msgHeight = document.getElementsByClassName('deps-popup')[0].offsetHeight;
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
    $('div.deps-popup').hide();
    resolve();
  });

  const studioPackageFound = (connectUrl, packageName) => {
    worker.desktopNotifier.cancel('no_studio_project');
    const toogleDesignerLivePreviewButton = (isEnabled) => {
      $('#designer-live-preview-button').toggleClass('enabled', isEnabled);
    };
    const toogleDesignerLivePreviewMessage = (cause) => {
      toogleDesignerLivePreviewButton(false);
      if (cause) {
        $('#designer-livepreview-message').css('display', 'block');
        $('#designer-livepreview-message a').text(cause);
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
        console.log('Error getting designer live preview status', cause);
        toogleDesignerLivePreviewMessage(cause);
      });

    const packageLocation = new URL(
      `/nuxeo/site/studio/ide?project=${packageName}`,
      connectUrl.href
    ).toString();
    $('#log-into-studio').attr(
      'href',
      new URL(packageLocation, connectUrl.href).toString()
    );
    $('#studio').click(() => {
      worker.tabNavigationHandler.loadNewExtensionTab(packageLocation);
    });
    $('#hot-reload-button').click(() => {
      startLoadingHR()
        .then(() => worker.studioHotReloader.reload())
        .then(stopLoading)
        .then(() => worker.tabNavigationHandler.reloadServerTab())
        .catch(stopLoading);
    });

    $('#force-hot-reload-button').click(() => {
      hideDependencyError()
        .then(startLoadingHR)
        .then(() => worker
          .studioHotReloader
          .reload(false))
        .then(stopLoading)
        .catch(stopLoading);
    });
    $('#cancel-button').click(() => {
      hideDependencyError()
        .then(() => worker.studioHotReloader.reset())
        .catch((error) => console.error(error));
    });
  };

  const noStudioPackageFound = () => {
    worker.desktopNotifier.notify(
      'no_studio_project',
      {
        title: 'No associated Studio project',
        message: 'If you\'d like to use this function, please associate your Nuxeo server with a studio project',
        iconUrl: '/images/access_denied.png'
      }
    );
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

  worker.serverConnector
    .asRegisteredStudioProject()
    .then(({ connectUrl }) => worker.connectLocator.asRegistration(connectUrl))
    .then(({ location, credentials }) => {
      const connectUrl = new URL(location);
      const connectCredentials = credentials;
      return { connectUrl, connectCredentials };
    })
    // eslint-disable-next-line no-unused-vars
    .then(({ connectUrl, connectCredentials }) => {
      const pendingPromises = [];
      $(document).ready(() => {
        // reset jQuery event handlers
        $('body').find('*').addBack().off();

        // process the page
        const browserVendor = worker.buildInfo.browserVendor();
        if (browserVendor === 'Firefox') {
          adjustStorageButtons();
        }

        // For chrome browser, the designer live preview is enable
        // for version upper 72
        $('#designer-livepreview-need-update').hide();
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

        $('#searchclear').click(() => {
          $('#search').val('');
          $('.no-result').css('display', 'none');
          $('#search-results').empty();
          $('body').css('overflow-y', 'hidden');
          $('html').outerHeight(height + 66);
        });

        $('#nxql-clear').click(() => {
          $('#nxql-docid').val('');
        });

        $('#logo').click(() => {
          $('#connect-url').toggle();
        });

        if (
          connectUrl.hostname !== 'connect.nuxeo.com'
        ) {
          $('#connect-url-input').val(
            connectUrl.toString()
          );
        }

        $('#save').click(() => {
          const savingPromises = [];

          // connect URL
          savingPromises.push(Promise.resolve($('#connect-url-input'))
            .then((inputField) => ($('#connect-url').hide(), { field: inputField, value: inputField.val() }))
            .then(({ field, value }) => {
              const registration = value.length !== 0
                ? worker.connectLocator.asRegistration(value)
                : worker.connectLocator.asRegistration();
              return registration
                .then(({ location }) => (field.val(location), location));
            }));

          // studio package name
          savingPromises.push(Promise.resolve($('#studio-package-name-input'))
            .then((selectBox) => (selectBox.length === 0 ? undefined : selectBox.val()))
            .then((name) => {
              if (!name) {
                return undefined;
              }
              return worker.serverConnector
                .registerDevelopedStudioProject(name)
                .then(() => name);
            }));

          // highlight
          savingPromises.push(worker.browserStore
            .set({ highlight: $('#highlight-input').prop('checked') })
            .then((store) => store.highlight));

          Promise
            .all(savingPromises)
            // eslint-disable-next-line no-unused-vars, no-shadow
            .then(([{ connectUrl }, packageName, highlight]) => {
              studioPackageFound(connectUrl, packageName);
              checkDependencyMismatch();
            })
            .then(() => worker.tabNavigationHandler.reloadServerTab());
        });

        $('#reset').click(() => {
          Swal.fire({
            title: 'Reset Options',
            text: 'Click Reset to reset all options to default settings.',
            showCancelButton: true,
            confirmButtonText: 'Reset',
            cancelButtonText: 'Cancel',
          }).then((result) => {
            if (!result.isConfirmed) return;
            Promise.all([
              worker.connectLocator
                .asRegistration('https://connect.nuxeo.com'),
              worker.jsonHighlighter
                .withHighlight(true)
            ])
              .then(() => {
                $('#connect-url-input').val('');
                $('#connect-url').hide();
                $('#studio-package-name-input').hide();
                $('#highlight-input').prop('checked', true);
              });
          });
        });

        // being resolved in promise for handles, better be bound in a dedicated class I think
        let onUI;
        let repository = 'default';
        let serverUrl;

        const regexes = {};
        regexes.uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
        regexes.ui.browse = new RegExp('(?:browse(?<path>/.+?(?=\\?|$)))');
        regexes.ui.docid = new RegExp(
          `(?:doc[\/A-Za-z_\.0-9]+(?<docid>${regexes.uuid.source}))`
        );
        regexes.ui.doc = new RegExp(
          `/(?:repo/(?<repo>${regexes.repo.source})|)ui/#!/(?:${regexes.ui.browse.source}|${regexes.ui.docid.source})`
        );

        function doGetJson(path) {
          worker.browserStore.get({ highlight: true }).then((res) => {
            if (res.highlight) {
              worker.documentBrowser.jsonOf(repository, path)
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

        function hideActionsAndToggles() {
          $('.buttons').css('display', 'none');
          $('.toggles').css('display', 'none');
        }

        pendingPromises.push(
          worker.browserStore
            .get({ highlight: true })
            .then(({ highlight: isChecked }) => $('#highlight-input').prop('checked', isChecked))
        );
        pendingPromises.push(checkDependencyMismatch());

        pendingPromises.push(worker.serverConnector
          .asNuxeo()
          .then((nuxeo) => {
            if (nuxeo.user.isAdministrator) return;
            hideActionsAndToggles();
          })
          .catch((error) => {
            worker.developmentMode.asConsole()
              .then((console) => console.warn('Not connected, cannot check user role', error));
            hideActionsAndToggles();
          }));

        pendingPromises.push(Promise.resolve($('#studio-package-name-input'))
          .then((selectBox) => (selectBox.length === 0 ? undefined : selectBox))
          .then((selectBox) => {
            if (!selectBox) return undefined;
            return worker.serverConnector
              .asDevelopedStudioProjects()
              .then((projects) => {
              // Remove any existing options
                while (selectBox[0].firstChild) {
                  selectBox[0].removeChild(selectBox[0].firstChild);
                }
                return projects;
              })
              .then((projects) => {
              // skip if no projects
                if (!projects) return undefined;

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
                return registeredPackageFound;
              })
              .then((registeredPackage) => ({
                handle: (registeredPackage
                  ? studioPackageFound
                  : noStudioPackageFound),
                parms: [connectUrl, registeredPackage]
              }))
              .then(({ handle, parms }) => handle(...parms))
              .catch((error) => {
                console.error(error);
              });
          }));

        pendingPromises.push(worker.serverConnector.executeOperation('Traces.ToggleRecording', { readOnly: true })
          // eslint-disable-next-line no-sequences
          .then((json) => json.value)
          .then((value) => Boolean(value))
          .then((isEnabled) => {
            $('#traces-button').toggleClass('enabled', isEnabled);
          }));

        pendingPromises.push(worker.serverConnector
          .asRuntimeInfo()
          .then((info) => {
            $('#platform-version').text(` ${info.nuxeo.serverVersion.version}`);
            return info;
          })
          .then((info) => {
            const nuxeoServerVersion = NuxeoServerVersion.create(info.nuxeo.serverVersion.version);
            const lts2019 = NuxeoServerVersion.create('10.10');
            if (nuxeoServerVersion.lt(lts2019)) {
              worker.browserStore
                .set({ highlight: true })
                .then(() => adjustStorageButtons());
            }
            return info;
          })
          .then((info) => {
            serverUrl = info.serverUrl.replace(/\/$/, '');
            return serverUrl;
          })
        // eslint-disable-next-line no-shadow
          .then((serverUrl) => {
            const serverString = DOMPurify.sanitize(serverUrl);
            $('div.server-name-url').text(serverString);
            return serverUrl;
          })
        // eslint-disable-next-line no-shadow
          .then((serverUrl) => {
            registerLink(
              '#automation-doc',
              serverUrl.concat('/site/automation/doc/')
            );
            return serverUrl;
          })
          // eslint-disable-next-line no-shadow
          .then((serverUrl) => {
            worker.serverConnector
              .asInstalledAddons()
              .then((addons) => {
                if (!addons.includes('nuxeo-web-ui')) {
                  $('#designer-livepreview').hide();
                }
                const playgroundUrl = addons.includes('nuxeo-api-playground')
                  ? `${serverUrl}/playground/#/${serverUrl}`
                  : `http://nuxeo.github.io/api-playground/#/${serverUrl}`;
                return registerLink('#api-playground', playgroundUrl);
              });
            return serverUrl;
          }));

        pendingPromises.push(worker.tabNavigationHandler
          .asTabParams()
          .then(({ url }) => {
            const jsfMatchs = regexes.jsf.doc.exec(url);
            const uiMatchs = regexes.ui.doc.exec(url);

            function exportCurrentLink(docPathOrId) {
              $('#export-current').css('display', 'block');
              $('#export-current').click(() => {
                if (regexes.uuid.test(docPathOrId)) {
                  getJsonFromGuid(docPathOrId);
                } else if (docPathOrId.startsWith('/')) {
                  getJsonFromPath(docPathOrId);
                }
              });
            }

            if (jsfMatchs || uiMatchs) {
              onUI = !!uiMatchs;
              const groups = (jsfMatchs || uiMatchs).groups;
              repository = groups.repoPath || groups.repoId || groups.repo || 'default';
              if (groups.path || groups.docid) {
                exportCurrentLink(groups.path || groups.docid);
              }
            }
            return url;
          }));

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

        let height = $('html').height();

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
            typeof vMajor !== 'undefined'
                && typeof vMinor !== 'undefined'
                && (vMajor !== 0 || vMinor !== 0)
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
                  const docPath = onUI ? `ui/#!/doc/${event.currentTarget.id}` : `nxdoc/default/${event.currentTarget.id}/view_documents`;
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
            .then(() => worker.tabNavigationHandler
              .loadNewExtensionTab('json/index.html'));
        };

        $('#restart-button').on('click', () => {
          Swal.fire({
            title: 'Warning!',
            text: 'Are you sure you want to restart the server?',
            showCancelButton: true,
            confirmButtonText: 'Restart',
            cancelButtonText: 'Cancel',
          }).then((result) => {
            if (result.isConfirmed) {
              startLoadingRS()
                .then(() => worker.serverConnector.restart())
                .then(stopLoading)
                .catch(stopLoading);
            }
          });
        });

        // Handle click events for the radio buttons
        $('#reindex-repo, #reindex-nxql').click(function () {
          // Toggle 'active' class for the clicked button
          $(this).toggleClass('active');

          // If the other button is active, remove its 'active' class
          if ($(this).is('#reindex-repo') && $('#reindex-nxql').hasClass('active')) {
            $('#reindex-nxql').removeClass('active');
          } else if ($(this).is('#reindex-nxql') && $('#reindex-repo').hasClass('active')) {
            $('#reindex-repo').removeClass('active');
          }

          // Show or hide the form based on which button is active
          if ($('#reindex-repo').hasClass('active')) {
            $('#reindex-form').css('display', 'none');
          } else {
            $('#reindex-form').css('display', 'block');
          }
        });

        // Handle click event for the 'reindex' button
        $('#reindex').click(() => {
          if ($('#reindex-repo').hasClass('active')) {
            worker.repositoryIndexer.reindex();
          } else {
            $('#reindex-form').show();
            const input = $('#reindex-input').val();
            $('#reindex-input').val('');
            worker.repositoryIndexer.reindex(input);
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

        $('#search').keydown(() => {
          $('#loading-gif').css({ display: 'inline' });
          $('#search').css('text-indent', '23px');
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
            } else if (regexes.uuid.test(input)) {
              getJsonFromGuid(input);
              $('#loading-gif').css('display', 'none');
              $('#search').css('text-indent', '5px');
            } else if (pathPattern.test(input)) {
              getJsonFromPath(input);
              $('#loading-gif').css('display', 'none');
              $('#search').css('text-indent', '5px');
            } else if (
              input.toUpperCase().indexOf('SELECT ') !== -1
                    && input.toUpperCase().indexOf(' FROM ') !== -1
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
              return cb();
            }
            if (!key.indexOf(input)) return true;
            input = `${e.keyCode}`;
            return true;
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
      }); // end of document.ready

      return Promise
        .all(pendingPromises)
        .then(() => worker)
        .catch((error) => console.error(error));
    })
    .catch((error) => {
      console.error(error);
    });
}

new ServiceWorkerBridge()
  .bootstrap()
  .then((worker) => {
    worker.developmentMode
      .asPromise()
      .then(() => {
        // can be used in development mode from the console for now
        worker.reloadPopup = () => worker.asPromise().then(loadPage);
        // Check if 'window' is defined, otherwise use 'window'
        // eslint-disable-next-line no-restricted-globals, no-undef
        const globalScope = typeof self !== 'undefined' ? self : window;
        globalScope.nuxeoWebExtension = worker;
      })
      .catch((error) => console.error(error));
    return worker;
  })
  .then(loadPage)
  .catch((e) => {
    console.error(e);
  });
