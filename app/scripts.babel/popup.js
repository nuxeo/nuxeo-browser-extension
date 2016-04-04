'use strict';

function getCurrentTabUrl(callback) {
  var queryInfo = {
    active: true,
    currentWindow: true
  };

  chrome.tabs.query(queryInfo, function(tabs) {
    var tab = tabs[0];
    var url = tab.url;
    var path = '/nuxeo/';
    var n = url.indexOf(path);
    url = url.substr(0, (n + path.length));
    console.assert(typeof url === 'string', 'tab.url should be a string');
    callback(url);
  });
};

var nuxeo;
getCurrentTabUrl(function(url) {
  nuxeo = new Nuxeo({
    baseURL: url,
    auth: {
      username: 'Administrator',
      password: 'Administrator'
    }
  });
  nuxeo.operation('Traces.ToggleRecording')
    .params({readOnly: true})
    .execute()
    .then(function(response) {
      $('#debug-switch').attr('checked', response.value);
    });
});

$(document).ready(function() {

  function openJsonWindow(jsonObject) {
    var jsonString;
    var w = 600;
    var h = 800;
    var left = (screen.width/2)-(w/2);
    var top = (screen.height/2)-(h/2);
    jsonString = JSON.stringify(jsonObject, undefined, 2);
    jsonString = btoa(jsonString);
    chrome.windows.create({'url': 'data:application/json;base64,' + jsonString, 'type': 'popup', 'width': w, 'height': h, 'left': left, 'top': top} , function(window) {});
  };

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var context = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  $('#hot-reload-button').click(function() {
    var bkg = chrome.extension.getBackgroundPage();
    nuxeo.operation('Document.HotReloadOperation').execute()
      .then(function() {
        bkg.notification('success', 'Success!', 'A Hot Reload has successfully been completed.', '../images/nuxeo-128.png');
      })
      .catch(function(e) {
        var err = e.response.status;
        if (err >= 500) {
          bkg.notification('access_denied', 'Access denied!', 'You must have Administrator rights to perform this function.', '../images/access_denied.png');
        } else if (err >= 300 && err < 500) {
          bkg.notification('bad_login', 'Bad Login', 'Your Login and/or Password are incorrect', '../images/access_denied.png');
        } else {
          bkg.notification('unknown_error', 'Unknown Error', 'An unknown error has occurred. Please try again later.', '../images/access_denied.png');
        };
      });
  });

  $('#autodoc-button').click(function() {
    chrome.tabs.create({
      url: nuxeo._baseURL.concat('site/automation/doc/')
    });
  });

  $('#debug-switch').click(function() {
    nuxeo.operation('Traces.ToggleRecording')
      .params({readOnly: false})
      .execute()
      .then(function(response) {
        $('#debug-switch').attr('checked', response.value);
      })
  });

  $('#json-search').keyup(debounce(function() {
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    var pathPattern = new RegExp('^/.+');
    var input = $('#json-search').val();
    if (uuidPattern.test(input)) {
      nuxeo.request('/id/' + input)
        .schemas('*')
        .get()
        .then(function(res) {
          openJsonWindow(res);
        })
        .catch(function(error) {
          throw new Error(error);
        });
    } else if (pathPattern.test(input)) {
      nuxeo.request('/path/' + input)
        .schemas('*')
        .get()
        .then(function(res) {
          openJsonWindow(res);
        })
        .catch(function(error) {
          throw new Error(error);
        });
    }
  }, 2000));
});
