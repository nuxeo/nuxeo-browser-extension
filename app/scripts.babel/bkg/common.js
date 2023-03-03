/*
Copyright 2016-2022 Nuxeo

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

const nxPattern = /(^https?:\/\/[A-Za-z_\.0-9:-]+\/[A-Za-z_\.0-9-]+\/)(?:(?:nxdoc|nxpath|nxsearch|nxadmin|nxhome|nxdam|nxdamid|site\/[A-Za-z_\.0-9-]+)\/[A-Za-z_\.0-9-]+|view_documents\.faces|ui\/#!\/|[a-zA-Z0-9_%]+\/?|view_domains\.faces|home\.html|view_home\.faces)/;

window.app = window.app || {};
const studioExt = window.studioExt = window.studioExt || {};

let dependencies;

let CONNECT_DOMAIN = 'connect.nuxeo.com';
let CONNECT_URL = `https://${CONNECT_DOMAIN}`;

chrome.storage.sync.get('value', (res) => {
  if (res.value && res.value.length > 0) {
    CONNECT_DOMAIN = res.value;
    CONNECT_URL = `https://${CONNECT_DOMAIN}`;
  } else {
    CONNECT_DOMAIN = 'connect.nuxeo.com';
    CONNECT_URL = `https://${CONNECT_DOMAIN}`;
  }
});

const setStudioUrl = window.setStudioUrl = (domain, cb) => {
  return chrome.storage.sync.set({ value: domain }, () => {
    CONNECT_DOMAIN = domain;
    CONNECT_URL = `https://${CONNECT_DOMAIN}`;
    if (cb) {
      cb();
    }
  });
}

const notification = window.notification = (idP, titleP, messageP, img, interaction, clickHandler) => {
  const click = clickHandler;
  try {
    chrome.notifications.create(idP, {
      type: 'basic',
      title: titleP,
      message: messageP,
      iconUrl: img,
      requireInteraction: interaction,
    }, () => {
      console.log(chrome.runtime.lastError);
    });

  } catch (err) {
    chrome.notifications.create(idP, {
      type: 'basic',
      title: titleP,
      message: messageP,
      iconUrl: img,
    }, () => {
      console.log(chrome.runtime.lastError);
    });
  }
  if (clickHandler) {
    browser.notifications.onClicked.addListener((notificationId) => {
      console.log('notification clicked ' + notificationId);
      if (notificationId === idP) {
        console.log('executing handler');
        click();
      }
    });
  }
};

/**
 * XXX Temp solution in order to be able to force Auth
 */

const newNuxeo = window.newNuxeo = (opts) => {
  const _opts = opts || {};
  if (window.app.auth) {
    _opts.auth = window.app.auth;
  }
  const nuxeo = new Nuxeo(_opts);

  // Workaround until next release of Nuxeo JS client
  nuxeo.SERVER_VERSIONS = Nuxeo.SERVER_VERSIONS;
  nuxeo.SERVER_VERSIONS.LTS_2019 = nuxeo.SERVER_VERSIONS.LTS_2017;
  nuxeo.SERVER_VERSIONS.LTS_2019.major = 10;
  nuxeo.SERVER_VERSIONS.LTS_2019.version = '10.10';
  return nuxeo;
};

const checkDependencies = `import groovy.json.JsonOutput;
  import org.nuxeo.connect.packages.PackageManager;
  import org.nuxeo.connect.packages.dependencies.TargetPlatformFilterHelper;
  import org.nuxeo.connect.client.we.StudioSnapshotHelper;
  import org.nuxeo.ecm.admin.runtime.PlatformVersionHelper;
  import org.nuxeo.ecm.admin.runtime.RuntimeInstrospection;
  import org.nuxeo.runtime.api.Framework;

  def pm = Framework.getService(PackageManager.class);
  def snapshotPkg = StudioSnapshotHelper.getSnapshot(pm.listRemoteAssociatedStudioPackages());
  def nxInstance = PlatformVersionHelper.getPlatformFilter();

  def pkgName = snapshotPkg == null ? null : snapshotPkg.getName();
  def targetPlatform = snapshotPkg == null ? null : snapshotPkg.getTargetPlatforms();
  def match = true;
  if (!TargetPlatformFilterHelper.isCompatibleWithTargetPlatform(snapshotPkg, nxInstance)) {
    match = false;
  }
  def dependencies = snapshotPkg == null ? null : snapshotPkg.getDependencies();

  println JsonOutput.toJson([studio: pkgName, nx: nxInstance, studioDistrib: targetPlatform, match: match, deps: dependencies]);`;

const defaultServerError = {
  id: 'server_error',
  title: 'Server Error',
  message: 'Please ensure that Dev Mode is activated.',
  imageUrl: '../images/access_denied.png',
  interaction: false,
};

const getCurrentTabUrl = window.getCurrentTabUrl = (callback) => {
  const queryInfo = {
    active: true,
    currentWindow: true,
  };

  chrome.tabs.query(queryInfo, (tabs) => {
    const [tab] = tabs;
    const matchGroups = nxPattern.exec(tab.url);
    if (!matchGroups) {
      callback(null);
      return;
    }

    const [, url] = matchGroups;
    window.studioExt.server = {
      url,
      tabId: tab.id,
    };

    callback(url);
  });
};

function newDefaultNuxeo() { return newNuxeo({ baseURL: window.studioExt.server.url }); }

function handleErrors(error, serverError) {
  error.response.json().then((json) => {
    const msg = json.message;
    const err = error.response.status;
    if (msg == null) {
      notification('no_hot_reload',
        'Hot Reload Operation not found.',
        'Your current version of Nuxeo does not support the Hot Reload function.',
        '../images/access_denied.png',
        false);
    } else if (err === 401) {
      notification('access_denied',
        'Access denied!',
        'You must have Administrator rights to perform this function.',
        '../images/access_denied.png',
        false);
    } else if (err >= 500) {
      notification(serverError.id,
        serverError.title,
        serverError.message,
        serverError.imageUrl,
        serverError.interaction);
    } else if (err >= 300 && err < 500) {
      notification('bad_login',
        'Bad Login',
        'Your Login and/or Password are incorrect',
        '../images/access_denied.png',
        false);
    } else {
      notification('unknown_error',
        'Unknown Error',
        'An unknown error has occurred. Please try again later.',
        '../images/access_denied.png',
        false);
    }
  });
}
