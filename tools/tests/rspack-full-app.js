var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
const APP_TEMPLATE = 'rspack-full-app-dup-collection';

function runOnceArgs() {
  return ['--once', '--exclude-archs', 'web.browser,web.browser.legacy,web.cordova'];
}

function testOnceArgs() {
  return [
    'test',
    '--once',
    '--full-app',
    '--driver-package',
    'meteortesting:mocha',
    '--exclude-archs',
    'web.browser,web.browser.legacy,web.cordova',
  ];
}

selftest.define('rspack: run does not generate test build context', ['checkout'], async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp('app', APP_TEMPLATE);
  s.cd('app');

  var run = s.run.apply(s, runOnceArgs());
  run.waitSecs(60);
  await run.match('App running at');
  await run.stop();

  // `meteor run` should not generate rspack test build-context files.
  if (s.readDir('_build/test') !== null) {
    selftest.fail('Expected _build/test to not exist after `meteor run`');
  }
  if (s.readDir('_build/test-full-app') !== null) {
    selftest.fail('Expected _build/test-full-app to not exist after `meteor run`');
  }
});

selftest.define('rspack: test --full-app uses test-full-app context and succeeds after prior run', ['checkout'], async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp('app', APP_TEMPLATE);
  s.cd('app');

  // Warm caches/build context (this is the common CI sequence).
  var warm = s.run.apply(s, runOnceArgs());
  warm.waitSecs(60);
  await warm.match('App running at');
  await warm.stop();

  s.set('TEST_CLIENT', '0');

  var testRun = s.run.apply(s, testOnceArgs());
  testRun.waitSecs(120);

  await testRun.match(/RSPACK_FULL_APP_MARKER CONFIG_SERVER=.*_build\/test-full-app\/server-meteor\.js/);
  await testRun.match(/RSPACK_FULL_APP_MARKER CONFIG_TEST_SERVER=.*_build\/test-full-app\/server-meteor\.js/);

  testRun.forbid(/_build\/main-dev\/server-meteor\.js/);
  testRun.forbid(/There is already a collection named/);

  await testRun.expectExit(0);
});

selftest.define('rspack: test --full-app entry imports main before tests', ['checkout'], async function () {
  var s = new Sandbox();
  await s.init();

  await s.createApp('app', APP_TEMPLATE);
  s.cd('app');

  s.set('TEST_CLIENT', '0');

  var testRun = s.run.apply(s, testOnceArgs());
  testRun.waitSecs(120);
  await testRun.expectExit(0);

  const entry = s.read('_build/test-full-app/server-entry.js');
  if (!entry) {
    selftest.fail('Expected _build/test-full-app/server-entry.js to exist');
  }

  const mainImportIndex = entry.indexOf("import '../../server/main.js'");
  const testImportIndex = entry.indexOf("import '../../tests/server.js'");

  if (mainImportIndex === -1 || testImportIndex === -1) {
    selftest.fail('Expected server-entry.js to import both server/main.js and tests/server.js');
  }

  if (mainImportIndex > testImportIndex) {
    selftest.fail('Expected server-entry.js to import main before tests');
  }
});
