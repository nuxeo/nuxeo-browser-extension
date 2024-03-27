/*
Copyright 2016-2019 Nuxeo

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
import { assert, expect, should } from 'chai';

function findTabByTitle(titleToFind, tabIds) {
  let title = browser.getTitle();
  for (let i = 0; i < tabIds.length; i += 1) {
    if (title.indexOf(titleToFind) > -1) {
      break;
    } else {
      browser.switchToWindow(tabIds[i]);
      browser.pause(500);
      title = browser.getTitle();
    }
  }
  title = browser.getTitle();
  if (title.indexOf(titleToFind) === -1) {
    return assert.fail([`"${titleToFind}" page not found.`]);
  }
  return title;
}

function openNuxeo() {
  return browser.execute(() => {
    window.open('http://localhost:8080/nuxeo');
  });
}

export { findTabByTitle, openNuxeo };
