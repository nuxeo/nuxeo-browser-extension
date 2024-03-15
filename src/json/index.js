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
import 'bootstrap';
import hljs from 'highlight.js';

import ServiceWorkerBridge from '../service-worker-bridge';

$(() => {
  const jsonHighlighter = new ServiceWorkerBridge().jsonHighlighter;
  jsonHighlighter.input().then((input) => {
    document.getElementById('json-string').textContent = input;
    try {
      hljs.highlightAll();
    } catch (e) {
      console.log('Sorry! JSON highlighting only available in Chrome.');
    }
  });
});