/*
Copyright 2016 Nuxeo

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

(function (window) {
  window.app = window.app || {};
  const app = window.app;

  const _AnalyticsCode = 'UA-79232642-1';
  const _gaq = _gaq || []; // eslint-disable-line no-use-before-define
  _gaq.push(['_setAccount', _AnalyticsCode]);
  _gaq.push(['_trackPageview']);

  const checkStudioPkg = `import groovy.json.JsonOutput;
    import org.nuxeo.connect.packages.PackageManager;
    import org.nuxeo.connect.client.we.StudioSnapshotHelper;
    import org.nuxeo.ecm.admin.runtime.RuntimeInstrospection;
    import org.nuxeo.runtime.api.Framework;

    def pm = Framework.getLocalService(PackageManager.class);
    def snapshotPkg = StudioSnapshotHelper.getSnapshot(pm.listRemoteAssociatedStudioPackages());
    def pkgName = snapshotPkg == null ? null : snapshotPkg.getName();
    def bundles = RuntimeInstrospection.getInfo();

    println JsonOutput.toJson([studio: pkgName]);`;

  (function () {
    const ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    ga.src = 'https://ssl.google-analytics.com/ga.js';
    const s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
  })();

  function trackButtonClick(e) {
    _gaq.push(['_trackEvent', e.target.id, 'clicked']);
  }

  function escapeHTML(str) {
    return str.replace(/[&"'<>]/g,	m	=>	escapeHTML.replacements[m]);
  }
  escapeHTML.replacements = { '&': '&amp;', '"': '&quot;', '\'': '&#39;', '<': '&lt;', '>': '&gt;' };

  document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('a');
    const debug = document.getElementById('traces-button');
    const exportCurrent = document.getElementById('export-current');
    const jsonSearch = document.getElementById('search');
    for (let i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', trackButtonClick);
    }
    debug.addEventListener('click', trackButtonClick);
    exportCurrent.addEventListener('click', trackButtonClick);
    jsonSearch.addEventListener('click', trackButtonClick);
  });

  app.browser.getBackgroundPage((bkg) => {
    function debounce(fn, delay) {
      let timer = null;
      return function (...args) {
        const context = this;
        clearTimeout(timer);
        timer = setTimeout(() => {
          fn.apply(context, args);
        }, delay);
      };
    }

    let position;

    function startLoadingHR() {
      _gaq.push(['_trackEvent', 'hot-reload-button', 'clicked']);
      const a = $('a#hot-reload-button');
      position = a.position();
      $('#loading').css({ display: 'block', top: (position.top - 5), left: (position.left - 50) });
    }

    function startLoadingRS() {
      _gaq.push(['_trackEvent', 'restart-button', 'clicked']);
      const a = $('a#restart-button');
      position = a.position();
      $('#loading').css({ display: 'block', top: (position.top - 5), left: (position.left - 50) });
    }

    function stopLoading() {
      $('#loading').css('display', 'none');
    }

    function noPkgFound() {
      $('#nopkg').css('display', 'block');
      setTimeout(() => {
        $('#nopkg').fadeOut('fast');
      }, 2000);
    }

    function stopSearching() {
      $('#message').css('display', 'none');
      noPkgFound();
    }

    function registerLink(element, url) {
      $(element).click(() => {
        app.browser.createTabs(url, bkg.studioExt.server.tabId);
      });
    }

    function showDependencyError(deps) {
      let depsList = '';
      let nuxeoctlCommand = 'nuxeoctl mp-install';
      deps.forEach((dep) => {
        depsList += `<li>${dep}</li>`;
        nuxeoctlCommand += ` ${dep}`;
      });
      $('#deps-list').append(depsList);
      $('div.nuxeoctl-command').append(nuxeoctlCommand);
      $('div.shade').show();
      $('div.deps-popup').show();
    }

    function hideDependencyError() {
      $('deps-list').empty();
      $('div.nuxeoctl-command').empty();
      $('div.shade').hide();
      $('div.deps-popup').hide();
    }

    function checkDependencyMismatch() {
      if (bkg.persistedVars.dependencyMismatch && bkg.persistedVars.uninstalledDeps.length > 0) {
        showDependencyError(bkg.persistedVars.uninstalledDeps);
      } else {
        hideDependencyError();
      }
    }

    $(document).ready(() => {
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

      checkDependencyMismatch();

      let onUI;
      let nuxeo;

      function getJsonFromPath(input) {
        input = input.replace(/%20/g, ' ');
        input = input.replace(/%22/g, '"');
        nuxeo.request(`/path/${input}`)
          .schemas('*')
          .enrichers({ document: ['acls', 'permissions'] })
          .get({ resolveWithFullResponse: true })
          .then(res => res.json())
          .then(openJsonWindow)
          .catch((error) => {
            throw new Error(error);
          });
      }

      function getJsonFromGuid(input) {
        nuxeo.request(`/id/${input}`)
          .schemas('*')
          .enrichers({ document: ['acls', 'permissions'] })
          .get({ resolveWithFullResponse: true })
          .then(res => res.json())
          .then(openJsonWindow)
          .catch((error) => {
            throw new Error(error);
          });
      }

      bkg.getCurrentTabUrl((url) => {
        nuxeo = bkg.newNuxeo({
          baseURL: url,
        });
        nuxeo.login()
          .then((res) => {
            if (!res.user.isAdministrator) {
              $('.buttons').css('display', 'none');
              $('.toggles').css('display', 'none');
            }
          }).catch((e) => {
            console.log(e);
          });
        bkg.executeScript(checkStudioPkg, stopSearching, (text) => {
          const pkgName = JSON.parse(text).studio;
          if (pkgName) {
            $('#message').css('display', 'none');
            $('#studio, #hot-reload-button').css('display', 'flex');
            $('#studio').click(() => {
              _gaq.push(['_trackEvent', 'studio', 'clicked']);

              const studioUrl = `https://connect.nuxeo.com/nuxeo/site/studio/ide?project=${pkgName}`;
              app.browser.createTabs(studioUrl, bkg.studioExt.server.tabId);
            });
            $('#hot-reload-button').click(() => {
              bkg.bkgHotReload(startLoadingHR, stopLoading, true, showDependencyError);
            });
            $('#force-hot-reload-button').click(() => {
              bkg.bkgHotReload(startLoadingHR, stopLoading, false, showDependencyError);
              hideDependencyError();
              bkg.persistVar('dependencyMismatch', false);
            });
            $('#cancel-button').click(() => {
              hideDependencyError();
              bkg.persistVar('dependencyMismatch', false);
            });
          } else {
            $('#studio, #hot-reload-button').css('display', 'none');
            $('#message').css('display', 'none');
            noPkgFound();
            $('#studio, #hot-reload-button').click(() => {
              bkg.notification('no_studio_project',
                'No associated Studio project',
                'If you\'d like to use this function, please associate your Nuxeo server with a studio project',
                '../images/access_denied.png');
            });
          }
        });

        nuxeo.operation('Traces.ToggleRecording')
          .params({ readOnly: true })
          .execute()
          .then((response) => {
            if (response.value) {
              $('#traces-button').addClass('enabled');
              $('#traces-button').removeClass('disabled');
            } else {
              $('#traces-button').addClass('disabled');
              $('#traces-button').removeClass('enabled');
            }
          });

        const serverString = escapeHTML(nuxeo._baseURL);
        $('div.server-name-url').html(serverString);

        const serverURL = nuxeo._baseURL.replace(/\/$/, '');

        registerLink('#automation-doc', nuxeo._baseURL.concat('site/automation/doc/'));
        registerLink('#api-playground', ('http://nuxeo.github.io/api-playground/#/').concat(serverURL));
        registerLink('#explorer', 'https://explorer.nuxeo.com');
        registerLink('#nxql', 'https://doc.nuxeo.com/display/NXDOC/NXQL');
        registerLink('#el-scripting', 'https://doc.nuxeo.com/display/NXDOC/Understand+Expression+and+Scripting+Languages+Used+in+Nuxeo');
        registerLink('#mvel', 'https://doc.nuxeo.com/display/NXDOC/Use+of+MVEL+in+Automation+Chains');
        registerLink('#workflow-variables', 'https://doc.nuxeo.com/display/NXDOC/Variables+Available+in+the+Automation+Context');
        registerLink('#escalation-rules', 'https://doc.nuxeo.com/display/NXDOC/Escalation+Service');
        registerLink('#nuxeo-elements', 'https://www.webcomponents.org/author/nuxeo');
        registerLink('#nuxeo-layouts', 'http://showcase.nuxeo.com/nuxeo/layoutDemo/');
        registerLink('#style-guide', 'http://showcase.nuxeo.com/nuxeo/styleGuide/');

        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const pathPattern = /^\//;
        const docPattern = /nxpath\/[A-Za-z_\.0-9-]+(\/[A-Za-z\.0-9_\- \/%~:?#'"]+)|(?:nxdoc[\/A-Za-z_\.0-9]+)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/;
        const uiDocPattern = /nuxeo\/ui\/#!\/browse(\/[A-Za-z\.0-9_\- \/%~:?#'"]+)|(?:nuxeo\/ui\/#!\/doc[\/A-Za-z_\.0-9]+)([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/;
        const matchGroupDoc = docPattern.exec(bkg.tabUrl);
        const matchGroupUiDoc = uiDocPattern.exec(bkg.tabUrl);

        function exportCurrentLink(docPath) {
          $('#export-current').css('display', 'block');
          $('#export-current').click(() => {
            if (uuidPattern.test(docPath)) {
              getJsonFromGuid(docPath);
            } else if (pathPattern.test(docPath)) {
              getJsonFromPath(docPath);
            }
          });
        }

        if (matchGroupDoc) {
          onUI = false;
          if (matchGroupDoc[1]) {
            exportCurrentLink(matchGroupDoc[1]);
          } else if (matchGroupDoc[2]) {
            exportCurrentLink(matchGroupDoc[2]);
          }
        } else if (matchGroupUiDoc) {
          onUI = true;
          if (matchGroupUiDoc[1]) {
            exportCurrentLink(matchGroupUiDoc[1]);
          } else if (matchGroupUiDoc[2]) {
            exportCurrentLink(matchGroupUiDoc[2]);
          }
        }
      });

      let height = $('html').height();

      function showSearchResults(icon, title, path, uid, vMajor, vMinor) {
        let titleTag;
        const iconLink = nuxeo._baseURL.concat(icon);
        const iconTag = `<td colspan=1 class="icon"><img class="doc-icon" src="${iconLink}" alt="icon"></td>`;
        if ((typeof vMajor !== 'undefined' && typeof vMinor !== 'undefined')) {
          titleTag = `<td colspan=18 class="doc-title" id="${uid}">${title} <span class="version">${vMajor}.${vMinor}</span></td>`;
        } else {
          titleTag = `<td colspan=18 class="doc-title" id="${uid}">${title}</td>`;
        }
        const jsonTag = `<td colspan=1 class="icon"><div class="json-icon" id="${uid}">&#9701;</div></td>`;
        const pathTag = `<td colspan=20 class="doc-path">${path}</td>`;
        $('tbody').append(`<tr class="search-result">${iconTag}${titleTag}${jsonTag}</tr><tr>${pathTag}</tr>`);
      }

      function docSearch(nxqlQuery, input) {
        nuxeo.repository()
          .schemas(['dublincore', 'common', 'uid'])
          .query({
            query: nxqlQuery,
            sortBy: 'dc:modified',
          })
          .then((res) => {
            if ((res.entries).length > 0) {
              $('.no-result').css('display', 'none');
              $('body').css('overflow-y', 'auto');
              $('#search-results').append('<thead><tr><th colspan=20>Search Results:</td></tr></thead><tbody></tbody>');
              $('table').css('margin-top', '20px');
              (res.entries).forEach((doc) => {
                $('html').outerHeight($('html').height());
                const icon = doc.get('common:icon');
                const title = doc.get('dc:title');
                const re = /^(.*[\/])/;
                const path = (re.exec(doc.path))[1];
                const uid = doc.uid;
                const vMajor = doc.get('uid:major_version');
                const vMinor = doc.get('uid:minor_version');
                showSearchResults(icon, title, path, uid, vMajor, vMinor);
              });
              $('.doc-title').click((event) => {
                let docURL;
                if (onUI) {
                  docURL = nuxeo._baseURL.concat(`ui/#!/doc/${event.target.id}`);
                } else {
                  docURL = nuxeo._baseURL.concat(`nxdoc/default/${event.target.id}/view_documents`);
                }
                app.browser.createTabs(docURL, bkg.studioExt.server.tabId);
              });
              $('.json-icon').click((event) => {
                event.preventDefault();
                getJsonFromGuid(event.target.id);
              });
            } else {
              const searchTerm = escapeHTML(input);
              $('.no-result span').text(searchTerm);
              $('.no-result').css('display', 'block');
            }
            $('#loading-gif').css('display', 'none');
            $('#search').css('text-indent', '5px');
          })
          .catch((error) => {
            error.response.json().then((json) => {
              bkg.notification('error', json.code, json.message, '../images/access_denied.png');
              $('#loading-gif').css('display', 'none');
              $('#search').css('text-indent', '5px');
            });
          });
      }

      let openJsonWindow = (jsonObject) => {
        const jsonString = JSON.stringify(jsonObject, undefined, 2);
        bkg._text = escapeHTML(jsonString);
        app.browser.createTabs('json.html', bkg.studioExt.server.tabId);
      };

      $('#restart-button').confirm({
        title: 'Warning!',
        text: 'Are you sure you want to restart the server?',
        confirmButton: 'Restart',
        cancelButton: 'Cancel',
        confirm: () => {
          bkg.restart(startLoadingRS, stopLoading);
        },
      });

      $('#reindex-repo').click(() => {
        $('#reindex-form').css('display', 'none');
        $('#reindex-repo').button('toggle');
      });
      $('#reindex-nxql').click(() => {
        $('#reindex-form').css('display', 'block');
        $('#reindex-repo').button('toggle');
      });
      $('#reindex').click(() => {
        if ($('#reindex-repo').hasClass('active')) {
          bkg.reindex();
        } else {
          $('#reindex-form').show();
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          const input = $('#reindex-input').val();
          $('#reindex-input').val('');
          const matchGroupId = uuidPattern.exec(input);
          if (matchGroupId) {
            bkg.reindexDocId(input);
          } else {
            bkg.reindexNXQL(input);
          }
        }
      });

      $('#nxql-docid').keydown((e) => {
        if (e.which === 13) {
          e.preventDefault();
          $('#reindex-nxql-doc').click();
        }
      });

      $('#traces-button').click(() => {
        nuxeo.operation('Traces.ToggleRecording')
          .params({ readOnly: false })
          .execute()
          .then((response) => {
            if (response.value) {
              $('#traces-button').addClass('enabled');
              if ($('#traces-button').hasClass('disabled')) {
                $('#traces-button').removeClass('disabled');
              }
            } else {
              $('#traces-button').addClass('disabled');
              if ($('#traces-button').hasClass('enabled')) {
                $('#traces-button').removeClass('enabled');
              }
            }
          })
          .catch(() => {
            nuxeo.operation('Traces.ToggleRecording')
              .params({ readOnly: true })
              .execute()
              .then((response) => {
                if (response.value) {
                  $('#traces-button').addClass('enabled');
                  $('#traces-button').removeClass('disabled');
                } else {
                  $('#traces-button').addClass('disabled');
                  $('#traces-button').removeClass('enabled');
                }
              });
          });
      });

      $('#search').keydown(() => {
        $('#loading-gif').css({ display: 'inline' });
        $('#search').css('text-indent', '23px');
      });

      $('#search').keyup(debounce(() => {
        $('#search-results').empty();
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const pathPattern = /^\//;
        const input = $('#search').val();
        if (input === '') {
          $('.no-result').css('display', 'none');
          $('#search-results').empty();
          $('#loading-gif').css('display', 'none');
          $('#search').css('text-indent', '5px');
          $('body').css('overflow-y', 'hidden');
          $('html').outerHeight(height + 66);
        } else if (uuidPattern.test(input)) {
          getJsonFromGuid(input);
          $('#loading-gif').css('display', 'none');
          $('#search').css('text-indent', '5px');
        } else if (pathPattern.test(input)) {
          getJsonFromPath(input);
          $('#loading-gif').css('display', 'none');
          $('#search').css('text-indent', '5px');
        } else if (((input.toUpperCase()).indexOf('SELECT ') !== -1)
            && ((input.toUpperCase()).indexOf(' FROM ') !== -1)) {
          const query = input.replace(/'/g, '"');
          docSearch(query, input);
          $('#loading-gif').css('display', 'none');
          $('#search').css('text-indent', '5px');
        } else {
          let searchTerm = input;
          if (searchTerm.indexOf('_') > -1) {
            searchTerm = searchTerm.replace(/_/g, '&UNDERSCORE');
          }
          if (searchTerm.indexOf('_') > -1) {
            searchTerm = searchTerm.replace(/_/g, '&BACKSLASH');
          }
          const jsonQuery = `SELECT * FROM Document WHERE ecm:fulltext = "${searchTerm}"`;
          docSearch(jsonQuery, input);
          $('#loading-gif').css('display', 'none');
          $('#search').css('text-indent', '5px');
        }
      }, 1000));
    });
  });
})(window);
