Package.describe({
  summary: "Simulates local storage on IE 6,7 using userData",
  version: "1.1.0-rc.2"
});

Package.onUse(function (api) {
  api.use('random');
  api.addFiles('localstorage.js');
});

Package.onTest(function (api) {
  api.use('localstorage');
  api.use('tinytest');
  api.addFiles('localstorage_tests.js');
});
